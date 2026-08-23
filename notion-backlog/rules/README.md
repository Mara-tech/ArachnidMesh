# What is a rule ?
A rule is some additional context passed to an agent while prompting to give boundaries.
It is loaded in the context, even if it is not useful to the task.
Therefore, it should exist, be brief, and refer to other files that can be loaded when necessary.

# Why this rules ?
This rule briefly indicates that for ticket tasks (read/write), some extended context exists.
On the first hand, a ticket should be written according to the Notion page instructions, therefore giving the link.
On the other hand, to implement a ticket, a prodecure exists, therefore pointing to the skill.

# How to set this up
As mentioned in the [skill set up](../skills/README.md#how-to-set-this-up), copy the other files than this README to your project's `.claude/rules/` folder.

## `language.md`
It is configured to communicate in French, and code in English. Customize it if you want.

## `notion-ticket.md`
Do not forget to adapt with your own variables :
1. `<your-notion-database>` : the database ID of your Notion database. Use [this tool](../tools/get_data_source_id.py) to find it.

   e.g : `collection://846ba48-d9a4-37c2-98b3-000becc465a1`
2. `<your-notion-database-url>` : raw URL of the same object as below.

   e.g : https://app.notion.com/p/4a83c367bad1f6869d
3. `<your-ticket-writing-instructions-notion-page>` : URL for general instructions for writing tickets.

   e.g : https://app.notion.com/p/3bc095c7d7e48197acb6e133331aa977

4. `<TICKET_ID_PREFIX>` : the prefix you might have provided when ran the [Notion database script](../tools/README.md#how-to-set-this-up). Otherwise, find it in the Notion database.

    e.g : LIN
