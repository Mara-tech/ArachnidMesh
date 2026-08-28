# Set up a Notion backlog
So far, coding agents work well with iterations, just like standard projects developed by humans.
A prioritized ticket backlog is a good way to work with iterations.


## The idea, starting from Scratch
Start with one ticket, defining roughly your idea.
This ticket is not a coding one. At this iteration, we expect it will create more tickets going into more details, and here you cascade.
One ticket at a time (usually you can parallelize tickets, but it's easier treating sequencially), your backlog evolves.
Some tickets will create more, others won't. In any case, the goal is to tackle the top priority, and set it to `done`.
Even with more of your ideas and bug/issues in the middle of the development, You will eventually bring your project to fruition.

## The short way

From the project you want to equip:

```bash
npx @mara-tech/arachnid-mesh
```

Tick **Create the Notion database** and it does steps 1 and 7 below for you, hands back the
`collection://…` URI, and installs the skills and rules configured with it — in one pass. You still
need steps 3 to 5 first: an integration token, and the two authorizations on the parent page.

Everything below is the same thing by hand, and stays the reference for what the wizard does.

## Prerequisites
💡An idea

🤖 A Coding Agent account, usually not for free 🤑, like Claude Code, Gemini, Codex, etc.

📒 A Notion account

## How to set this up

1. From Notion, create a new page. I recommend to name it `Backlogs`, as it will be the parent page for all your backlogs, as you'll probably have several ideas. 

2. Create a regular page under `Backlogs` that will hold instructions for how a ticket should be created. 
Copy the content of [this page](Rédiger%20un%20ticket.md).
Note : It could be a rule, but when you are using a [project](../project/README.md), with no coding access, you can have these instructions centralized directly in Notion.
3. Create a new access token from [Notion connection settings](https://app.notion.com/developers/connections). Copy it.

4. **Give that token access to the `Backlogs` page.** In Notion, open `Backlogs` → `···` → **Connections** → add the integration you just created.
Creating a token does not grant it anything: without this, the script fails with a `404` on `--parent-page-id` and the message does not say why. Child pages inherit, so this is done once for all your backlogs.

5. **Give Claude access to the same page**, the same way : `···` → **Connections** → add **Claude**.
This is a separate authorization from the token above — the token is for the scripts on this page, the connector is how Claude reads and writes your tickets, from a chat or from the `/go` skill.

6. Install the script's only dependency (Python 3.10+) :

    ```bash
    pip install requests
    ```

7. Run the [Backlog creation Python script](create_notion_backlog.py)

    ```bash
    python3 create_notion_backlog.py \
        --name <BACKLOG_NAME> \
        --parent-page-id <ID> \
        --token <TOKEN> \
        [--prefix <TICKET_ID_PREFIX>]
    ```

    Where:
    - `<BACKLOG_NAME>` is the name of the backlog you want to create. (e.g. `LinkedIn Backlog`)
    - `<ID>` is the ID of the parent page (`Backlogs`) you created in step 1 (e.g `9ef3d...42d`), that you can extract from the URL of the page.
    - `<TOKEN>` is the Notion access token you copied in step 3 (e.g `ntn_e30a16...`). It can also be passed through the `NOTION_TOKEN` environment variable.
    - `<TICKET_ID_PREFIX>` is optional. It is the prefix you want to use for your tickets (e.g `LIN`). If not provided, it will be guessed from the name.

8. **Check it landed.** Refresh Notion (`F5`) : your backlog now sits under `Backlogs`, and it holds **three sample tickets**.
They exist to show what a filled-in ticket looks like — open one, compare it with [Rédiger un ticket](Rédiger%20un%20ticket.md), then **delete all three**. Your backlog is meant to start empty, so that the first ticket you dequeue is your own.


## Next steps
- Get the `collection://…` URI of your new backlog with [get_data_source_id.py](get_data_source_id.py) — the rules and skills need it.
  (`npx @mara-tech/arachnid-mesh` resolves it for you from the backlog URL, or hands it back directly when it created the database.)
- Want to talk to explain your idea ? Check out [Project instructions](../project/README.md)
- Want to let a coding agent work on an iteration ? Check out [Skills](../skills/README.md)
