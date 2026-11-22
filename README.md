# tiny-stack-vm-01-run-20261122

[![make.fun](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)

A tiny stack VM for make.fun's 22 November 2026 bounty. It runs every
bytecode program in the kit's ISA and answers with exactly the bytes each
program writes and its exit code — including the hard edges: wrapping
multiply, INT_MIN / -1, unsigned div/mod/compare, shifts masked to 5 bits,
and all ten traps with the step and output limits.
