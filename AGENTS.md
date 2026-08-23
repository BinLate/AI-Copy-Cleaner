
<!-- gemini-and-chatgpt:begin -->
# Automatic Gemini + ChatGPT PR Review Gate
For every implementation, bug fix, refactor, or feature coding task, automatically apply `.agents/skills/gemini-and-chatgpt/SKILL.md`. Do not wait for the user to mention the skill.

Mandatory order after implementation: verify locally -> ensure GitHub authentication and `origin` remote -> commit/push a dedicated branch -> create or update a GitHub Pull Request -> obtain the exact current PR HEAD SHA -> only then open ChatGPT Web for independent review. Never open ChatGPT for the code-review phase before a GitHub PR exists. If GitHub authentication or the remote is missing, stop and tell the user to rerun `gemini-and-chatgpt\INSTALL-ANTIGRAVITY.bat`.

For ChatGPT Web prompt entry, never intentionally type a long review prompt character-by-character. First write the complete prompt to a local text file, run `.agents/skills/gemini-and-chatgpt/scripts/copy_review_prompt.ps1` to copy it to the Windows clipboard, then focus the ChatGPT composer and paste once with Ctrl+V. Direct field-fill is also acceptable. Simulated typing is a last resort only when clipboard/direct fill is unavailable.

After `REQUEST_CHANGES`, evaluate findings, fix valid blockers, verify again, push the new HEAD, and repeat the review with a fresh ChatGPT conversation. Automatic merge remains OFF unless the user explicitly enables it.
<!-- gemini-and-chatgpt:end -->

