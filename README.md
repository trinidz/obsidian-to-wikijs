# Obsidian to Wikijs

 The Obsidian-to-Wikijs plugin enables you to send [Obsidian](https://obsidian.md) notes to your [Wikijs](https://github.com/Requarks/wiki) instance. It is based on Southpaw1496's [obsidian-send-to-ghost](https://github.com/Southpaw1496/obsidian-send-to-ghost).

## Usage

### Authentication
Obsidian-to-Wikijs requires a valid API key to send to a Wikijs instance. To generate an API key, login to Wikijs as an administrator and go to the Administration area (Administration > API Access). The API key will be a very long (about 500 characters) string of random characters. Because Obsidian plugins [can't store sensitive information securely](https://forum.obsidian.md/t/a-place-for-plugins-sensitive-data/18308), you should use an API key with permission to read and write pages of your specific account.

### Plugin Setup

Install the Obsidian-to-Wikijs plugin in Obsidian, then go settings and fill in the fields: 
- Add the URL of your Wikijs instance to the "Wikijs URL" field (for example `https://wiki.mydomain.com or http://ip_address:port`). 
- Add your Wikijs API key to the "API key" field. 

### Front Matter

Obsidian-to-Wikijs requires front matter to work correctly. The front matter allows for Wikijs-specific settings such as the title, tags, short description etc.  Most importantly, the front matter contains a uuid field which is used to help uniquely identify each note sent to wikijs.  It is recommended to create a template using the following frontmatter, and then add it to your obsidian notes as needed. The front mattter is created by enclosing the necessary wikijs settings in `---` at the beginning of a note.

The following front matter (without the # comments) is required for Obsidian-to-Wikijs to work properly:

```md
---
title: # Title of wikijs post. Defaults to note name. (Optional)
short_desc: # Short description of wikijs post. Defaults to blank. (Optional)
tags: # Tags of the wikijs post. A tag of o2w-uuid will always be added. (Optional)
path: # Location of the post on your wikijs. Defaults to obsidian/uuid. (Optional)
public: true # True = make post public on wikijs. False = make post private.
update: true # True = Update wikijs post if it exists. False = Do not update.
editor: markdown # Do not change
uuid: "{{date:x}}" # Do not change
---
```

When you add the front matter to your Obsidian note the uuid should be automatically generated.  The uuid uses a very accurate timestamp. The uuid is used by the plugin to identify and access the notes once they are posted on Wikijs.  Once the plugin setup is complete, and you have added the front matter to your note, you can click the upload "Send to Wikijs" icon in the ribbon menu on the left to send the currently open note to Wikijs.

- The front matter fields listed as (Optional) can be left empty or with the default value as shown.
- To delete a note from your Wikijs instance, add the tag 'delete' to the tags field in the front matter, then click the upload icon in the ribbon menu. 

## Development

This plugin uses PNPM for dependency management.

-   Clone the repository.
-   Run `pnpm i` to install the necessary dependencies
-   Run `pnpm dev` to automaticlly recompile as the project files change.

## Manual installation

-   Run `pnpm build`
-   Copy `main.js` and `manifest.json` to `VaultFolder/.obsidian/plugins/send-to-wikijs/` where `Vaultfolder` is the location of your Obsidian vault.

## Issues & Support

If you find a bug, please submit an [issue](https://github.com/trinidz/obsidian-to-wikijs).