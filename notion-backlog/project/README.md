# What is a project ?

Using Claude, a Project is a tool, along with Artifacts, Code, and simple Chats.

# How to set this up

## Prerequisites

0. Set up a [Notion backlog](../tools/README.md).
1. Your Claude must be connected to Notion.
2. Put the [instructions](claude_project_instructions.md) in Project Instructions.
3. Adapt with your own variables :
   1. `<Project name and very basic presentation>` : one or two lines

      e.g : LinkedIn is a social network for business people
   2. `<Project name>` : repeat the project name.

      e.g : LinkedIn
   3. `<your-notion-database>` : the database ID of your Notion database. Use [this tool](../tools/get_data_source_id.py) to find it.

      e.g : `collection://846ba48-d9a4-37c2-98b3-000becc465a1`
   4. `<your-ticket-writing-instructions-notion-page>` : URL for general instructions for writing tickets.

      e.g : https://app.notion.com/p/Rediger-un-ticket-3bc095c7d7e48197acb6e133331aa977

## Now what ?

From any Claude application (mobile, web, desktop), you can prompt about the backlog, Claude can read/write a ticket database from Notion.
The best example is to create a ticket just because you think of it right now, even with no access to the code.
