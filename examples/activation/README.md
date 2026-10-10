# Fixed protected promoter

promoter.mjs accepts only a strict activation request on stdin. Its code,
interpreter, dependencies, adjacent trust.json and service environment must be
installed under the consumer owner's control. The proposer must have a separate
unprivileged account and access only to proposal storage and the fixed service.
The wrapper accepts no caller arguments, configuration location or clock.

Trust configuration and production installation are external owner decisions;
the repository deliberately supplies neither production grants nor credentials.
See [ACTIVATION.md](../../ACTIVATION.md) for the Linux filesystem profile, SDK,
consumer reads, durability assumptions, revocation and acceptance evidence.

Normal npm test exercises this actual wrapper from a disposable protected
installation on Linux, along with a separate unprivileged native consumer.
