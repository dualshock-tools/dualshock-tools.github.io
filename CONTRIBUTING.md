# Contributing

Thanks for contributing! These guidelines are mainly about keeping changes easy to review and maintain.

## Keep Pull Requests small

Please keep PRs **small and focused**. Ideally, each PR should contain one logical change.

If a larger feature can be split into multiple independent parts, please do so.
Each PR should be as **self-contained** as reasonably possible.

Review time grows quickly with PR size. As a rough guideline:

* A few dozen changed lines: often reviewable the same day.
* Around 100 lines: potentially several days or a week.
* 1000+ lines: potentially several months.

These are not strict limits, but they illustrate why smaller PRs are strongly preferred.

## Separate logical changes

Avoid mixing unrelated changes such as refactoring, bug fixes, UI changes, and new features in the same PR.

For example, it is usually better to submit:

1. Add support for a new controller
2. Add calibration support
3. Improve the UI

as separate PRs rather than one large PR.

## Make review easy

Before opening a PR, review your own diff and remove unrelated changes, temporary code, and unnecessary formatting changes.

Please include a short description of:

* **What** the PR changes
* **Why** it is needed
* How it was **tested**

## Testing

Make sure the project builds and relevant tests pass before submitting a PR.

For hardware-specific changes, mention what hardware and browsers you tested with when relevant.

## When in doubt, split it

If a PR contains several independent ideas, it is probably better to split it.

Smaller PRs are easier to review, discuss, test, and merge.

## Translations

When adding new user-facing text, the corresponding strings should be added to **all** `lang/*.json` files.
Ideally, the translations can be added in a follow-up PR so that the feature PR stays small.

The scripts `scripts/process_lang.py` and `scripts/check_translations.py` can help with managing and checking translations.

Whenever possible, please **reuse existing translated text** rather than introducing a new string with the same meaning.

When changing an existing piece of text, the change should also be reflected in all translation files.
For an obvious error, it is acceptable to remove the old translated string and replace it with a new untranslated entry, leaving the translation empty until translators can update it.

For purely cosmetic wording changes, however, keep in mind that changing an existing string creates extra work for **all translators**.
Avoid such changes unless they provide a meaningful improvement.

## A note to contributors

A huge thank you to all current and future contributors!
Your help is greatly appreciated and makes a real difference to the project.

The main maintainers work on this project in their free time, often reviewing PRs in the evenings and on weekends.
Since the project is currently used by hundreds of thousands of people every month, we prioritize stability and take changes to the codebase seriously.

Thank you for your patience with the review process and for helping us keep the project reliable for everyone.
