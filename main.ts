// Tiny stack VM: the kit ISA exactly. 32-bit wrapping values, 256-slot
// data stack, 64 call slots, 256 memory words, traps 2-11.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STACK_CAP = 256;
const CALL_CAP = 64;
const MEM_WORDS = 256;
const STEP_CAP = 1_000_000;
const OUT_CAP = 65_536;

const IMM: Record<number, number> = { 0x00: 0, 0x01: 1, 0x02: 4, 0x03: 0, 0x04: 0, 0x05: 0, 0x06: 0, 0x07: 0, 0x10: 0, 0x11: 0, 0x12: 0, 0x13: 0, 0x14: 0, 0x15: 0, 0x16: 0, 0x17: 0, 0x18: 0, 0x19: 0, 0x1a: 0, 0x1b: 0, 0x1c: 0, 0x1d: 0, 0x1e: 0, 0x20: 0, 0x21: 0, 0x22: 0, 0x30: 2, 0x31: 2, 0x32: 2, 0x33: 2, 0x34: 0, 0x40: 0, 0x41: 0, 0x50: 0, 0x51: 0, 0x52: 0, 0x53: 0 };
const POPS: Record<number, number> = { 0x03: 1, 0x04: 1, 0x05: 2, 0x06: 2, 0x07: 3, 0x10: 2, 0x11: 2, 0x12: 2, 0x13: 2, 0x14: 2, 0x15: 2, 0x16: 2, 0x17: 1, 0x18: 2, 0x19: 2, 0x1a: 2, 0x1b: 1, 0x1c: 2, 0x1d: 2, 0x1e: 2, 0x20: 2, 0x21: 2, 0x22: 2, 0x31: 1, 0x32: 1, 0x40: 1, 0x41: 2, 0x50: 1, 0x51: 1, 0x53: 1 };
const PUSHES: Record<number, number> = { 0x01: 1, 0x02: 1, 0x04: 2, 0x05: 2, 0x06: 3, 0x07: 3, 0x10: 1, 0x11: 1, 0x12: 1, 0x13: 1, 0x14: 1, 0x15: 1, 0x16: 1, 0x17: 1, 0x18: 1, 0x19: 1, 0x1a: 1, 0x1b: 1, 0x1c: 1, 0x1d: 1, 0x1e: 1, 0x20: 1, 0x21: 1, 0x22: 1, 0x40: 1, 0x52: 1 };

function run(prog: Uint8Array, input: Uint8Array) {
  const st = new Int32Array(STACK_CAP);
  const calls = new Int32Array(CALL_CAP);
  const mem = new Int32Array(MEM_WORDS);
  const buf = new Uint8Array(OUT_CAP);
  let sp = 0, csp = 0, olen = 0, ipos = 0, pc = 0, steps = 0;
  const finish = (exit: number) => ({ out: buf.slice(0, olen), exit });

  for (;;) {
    if (steps === STEP_CAP) return finish(10);
    if (pc < 0 || pc >= prog.length) return finish(9);
    const op = prog[pc];
    const imm = IMM[op];
    if (imm === undefined) return finish(5);
    if (pc + imm >= prog.length) return finish(9);
    steps++;
    const at = pc;
    pc = at + 1 + imm;
    const need = POPS[op] ?? 0;
    const give = PUSHES[op] ?? 0;
    if (sp < need) return finish(2);
    if (sp - need + give > STACK_CAP) return finish(3);

    switch (op) {
      case 0x00:
        return finish(0);
      case 0x01:
        st[sp++] = (prog[at + 1] << 24) >> 24;
        break;
      case 0x02:
        st[sp++] = prog[at + 1] | (prog[at + 2] << 8) | (prog[at + 3] << 16) | (prog[at + 4] << 24);
        break;
      case 0x03:
        sp--;
        break;
      case 0x04:
        st[sp] = st[sp - 1];
        sp++;
        break;
      case 0x05: {
        const t = st[sp - 1];
        st[sp - 1] = st[sp - 2];
        st[sp - 2] = t;
        break;
      }
      case 0x06:
        st[sp] = st[sp - 2];
        sp++;
        break;
      case 0x07: {
        const a = st[sp - 3];
        st[sp - 3] = st[sp - 2];
        st[sp - 2] = st[sp - 1];
        st[sp - 1] = a;
        break;
      }
      case 0x17:
        st[sp - 1] = (-st[sp - 1]) | 0;
        break;
      case 0x1b:
        st[sp - 1] = ~st[sp - 1];
        break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = st[sp - 1];
        const a = st[sp - 2];
        let r: number;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) {
          if (b === 0) return finish(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 0x14) {
          if (b === 0) return finish(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 0x15) {
          if (b === 0) return finish(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 0x16) {
          if (b === 0) return finish(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        st[sp - 2] = r;
        sp--;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((prog[at + 1] | (prog[at + 2] << 8)) << 16) >> 16;
        let take = op === 0x30;
        if (op !== 0x30) {
          const v = st[--sp];
          take = op === 0x31 ? v === 0 : v !== 0;
        }
        if (take) pc += rel;
        break;
      }
      case 0x33:
        if (csp === CALL_CAP) return finish(7);
        calls[csp++] = pc;
        pc = prog[at + 1] | (prog[at + 2] << 8);
        break;
      case 0x34:
        if (csp === 0) return finish(8);
        pc = calls[--csp];
        break;
      case 0x40: {
        const addr = st[sp - 1];
        if (addr < 0 || addr >= MEM_WORDS) return finish(6);
        st[sp - 1] = mem[addr];
        break;
      }
      case 0x41: {
        const addr = st[sp - 1];
        const v = st[sp - 2];
        if (addr < 0 || addr >= MEM_WORDS) return finish(6);
        mem[addr] = v;
        sp -= 2;
        break;
      }
      case 0x50: {
        const text = String(st[sp - 1]);
        if (olen + text.length > OUT_CAP) return finish(11);
        for (let i = 0; i < text.length; i++) buf[olen++] = text.charCodeAt(i);
        sp--;
        break;
      }
      case 0x51:
        if (olen + 1 > OUT_CAP) return finish(11);
        buf[olen++] = st[--sp] & 255;
        break;
      case 0x52:
        st[sp++] = ipos < input.length ? input[ipos++] : -1;
        break;
      case 0x53:
        return finish(st[--sp] & 255);
      default:
        return finish(5);
    }
  }
}

const IND = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTD = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(IND).sort()) {
  const prog = new Uint8Array(readFileSync(join(IND, id, 'program.bin')));
  const input = new Uint8Array(readFileSync(join(IND, id, 'input.bin')));
  const result = run(prog, input);
  mkdirSync(join(OUTD, id), { recursive: true });
  writeFileSync(join(OUTD, id, 'stdout.bin'), result.out);
  writeFileSync(join(OUTD, id, 'exit.txt'), `${result.exit}\n`);
}
