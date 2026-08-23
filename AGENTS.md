
<!-- gemini-and-chatgpt:begin -->
# Automatic Gemini + ChatGPT PR Review Gate
For every implementation, bug fix, refactor, or feature coding task, automatically apply `.agents/skills/gemini-and-chatgpt/SKILL.md` as the post-implementation quality gate.

Mandatory order: implement → test/lint/build → push branch → create/update GitHub PR → ask ChatGPT.com to review the PR → fix findings → repeat until ChatGPT returns PASS.

For ChatGPT prompt entry: write the prompt to a file, copy to clipboard using `copy_review_prompt.ps1`, then paste into ChatGPT.com via the browser. After `REQUEST_CHANGES`, evaluate findings, fix valid blockers, verify again, push the new HEAD, and repeat the review with a fresh ChatGPT conversation. Automatic merge remains OFF unless the user explicitly enables it.
<!-- gemini-and-chatgpt:end -->
