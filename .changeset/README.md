# Changesets

Every pull request that changes the published package adds a changeset describing the change for the changelog:

```bash
npx changeset          # pick patch / minor / major and describe the change
npx changeset --empty  # for changes that should not trigger a release (docs, CI, benchmarks)
```

On `main`, the Release workflow collects pending changesets into a "chore: version packages" pull request that bumps the version and updates `CHANGELOG.md`. Merging that pull request publishes the new version to npm and creates the GitHub release.

See the [Changesets documentation](https://github.com/changesets/changesets) for details.
