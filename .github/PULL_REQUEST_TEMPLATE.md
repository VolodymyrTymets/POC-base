## <TICKET> <title>

### What changed
-

### Why
<business reason, one or two lines>
Spec: `docs/features/<TICKET>/spec.md` · Plan: `docs/features/<TICKET>/plan.md`

### Contract impact
- API: none | <query/mutation>, breaking? <yes/no>, consumers updated here? <yes/no>
- DB: none | migration `<name>`, expand/contract step, rollback: <how>, deploy order: <migrate first / release first>
- Shared types: none | regenerated with `<command>`

### Verification
<!-- Required. Real commands and real output. The evidence-check job fails this PR if it is missing. -->
- typecheck:
- lint:
- tests:
- executed:

### Not verified
<!-- Never delete this section. Write "nothing" only if that is true. -->
-

### Review focus
<the two or three places to look hardest, and why>

### Checklist
- [ ] Scope matches the ticket only (no drive-by changes)
- [ ] No silenced check (type checker, linter, skipped test, pre-commit bypass) without an approved `WHY:`
- [ ] Docs updated in this PR
- [ ] Opened as a draft; a human marks it ready
