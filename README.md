# CS50.ai

Provide everyone with their own virtual duck on VS Code and introduce students to the concept of rubber duck debugging. This is a technique that involves talking to a rubber duck (or any inanimate, or even animate object) about a bug in their code.

Now, with the power of OpenAI's ChatGPT, your rubber duck can talk back! The ddb50 extension leverages ChatGPT to provide a conversational coding experience, further enriching the practice of rubber duck debugging. This approach gives students a more dynamic way to address and discuss code issues.

## Authentication

The duck authenticates with [cs50.ai](https://cs50.ai) using a GitHub token from the codespace's environment: `CS50_TOKEN` (written by [cs50.dev](https://cs50.dev) when you log in) is tried first, and `GITHUB_TOKEN` (provided by GitHub Codespaces) is used as a fallback if that token is rejected. Outside of a codespace, where neither variable is set, the duck cannot connect.

## Troubleshooting

If the duck cannot get a response, it explains what went wrong in the chat itself (HTTP status and the server's message, or the network error) along with what to try. The same details, including which token was used, are logged under **View → Output → "CS50 Duck"**; paste that log into a support thread when asking for help.

Most authentication failures are fixed by logging in again at [cs50.dev](https://cs50.dev) and then fully stopping and restarting (or rebuilding) the codespace, so that a fresh `CS50_TOKEN` is loaded.
