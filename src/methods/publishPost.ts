/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, DataProp } from "./../types/index";
import { MarkdownView, Notice, requestUrl, RequestUrlParam } from "obsidian";

const matter = require("gray-matter");
const UUID_TAG_HDR = "o2w-"

let wikijsReq: RequestUrlParam = {
	url: "",
	method: "POST",
	contentType: "application/json",
	headers: {
		"Content-Type": "application/json",
		"Accept": "application/json",
		"Connection": "keep-alive",
		"DNT": "1",
		//"Access-Control-Allow-Methods": "POST",
		"Accept-Encoding": "gzip, deflate, br",
		//"Origin": "https://wiki.example.org",
	},
	body:""
}

export const publishPost = async (view: MarkdownView, settings: SettingsProp) => {
	const noteFile = view.app.workspace.getActiveFile();
	const metaMatter = view.app.metadataCache.getFileCache(noteFile).frontmatter;

	if (settings.url == "" ){ 
		new Notice("Invalid Site URL. Please Check your Site URL setting.") 
			return
	} else if (settings.adminToken.length != 502) { 
		new Notice("Invalid API Key. Please Check your API Token setting.") 
			return
	} else if (metaMatter.uuid == undefined) { 
		new Notice("uuid is missing from document front matter.") 
			return
	} else {
		const UUIDTAG = `${UUID_TAG_HDR}${metaMatter.uuid}`
		const data = matter(view.getViewData());
		const noteID = await wikiPostExists(UUIDTAG, settings);
		
		const frontmatter = {
			uuid: metaMatter.uuid,
			path: metaMatter?.path || `obsidian/${metaMatter.uuid}`,
			title: metaMatter?.title || view.file.basename,
			tags: metaMatter?.tags || [UUIDTAG],
			public: metaMatter?.public || false,
			update: metaMatter?.update || false,
			private: metaMatter?.private || false,
			short_desc: metaMatter?.short_desc || "",
			editor: metaMatter?.editor || "markdown",
			locale: metaMatter?.locale || "en",
		};

		const content_filtered = (<DataProp>data).content
			.replace(/\\/g, "/")
			.replace(/\"/g, "'")
			.replace(/\n/g, "\\n")
			.replace(/\r/g, "\\r")
			.replace(/\t/g, "\\t")
		
		let tagArr = "["
		frontmatter.tags.forEach((element: string) => {tagArr += `\"${element}\",`});
		tagArr += `\"${UUIDTAG}\"]`

		new Notice(`Connecting to ${settings.url} ...`);

		let reqBody: string;
		try {
			if (frontmatter.tags.contains("delete")) {
				if(noteID == -1){
				new Notice(`Can not delete. Page does not exist!`)
				return
			}
				reqBody = JSON.stringify({ query: `mutation {pages { delete( id: ${noteID} ) {responseResult { succeeded slug errorCode message } } } }` })
			} else if (noteID == -1 || !frontmatter.update) {
				reqBody = JSON.stringify({ query: `mutation {pages { create( path: "${frontmatter.path.replace(/\\/g, "/")}" title: "${frontmatter.title.replace(/\\/g, "/")}" description: "${frontmatter.short_desc.replace(/\\/g, "/")}" content: "${content_filtered}" editor: "${frontmatter.editor}" isPublished: ${frontmatter.public} isPrivate: ${frontmatter.private} tags: ${tagArr} locale: "${frontmatter.locale}" ) {responseResult { succeeded slug errorCode message } } }}` })
			} else {
				reqBody = JSON.stringify({ query: `mutation {pages { update( id: ${noteID} path: "${frontmatter.path.replace(/\\/g, "/")}" title: "${frontmatter.title.replace(/\\/g, "/")}" description: "${frontmatter.short_desc.replace(/\\/g, "/")}" content: "${content_filtered}" editor: "${frontmatter.editor}" isPublished: ${frontmatter.public} isPrivate: ${frontmatter.private} tags: ${tagArr} locale: "${frontmatter.locale}" ) {responseResult { succeeded slug errorCode message } } }}` })
			}

            wikijsReq.url = `${settings.url}/graphql`;
			wikijsReq.headers["Authorization"] = `Bearer ${settings.adminToken}`
			wikijsReq.body = reqBody;
			const result = await requestUrl(wikijsReq)

			const json = result.json;
			if (json?.data?.pages?.create?.responseResult) {
				if (json?.data.pages.create.responseResult.succeeded) {
					new Notice(`Success -- Page ${settings.url}/${frontmatter.path} posted!`)
				} else {
					new Notice(`Error -- ${json?.data.pages.create.responseResult.slug} -- Code: ${json?.data.pages.create.responseResult.errorCode} -- Page not posted to wikijs!`)
				}
			} else if (json?.data?.pages?.update?.responseResult) {
				if (json?.data.pages.update.responseResult.succeeded) {
					new Notice(`Success -- Page ${settings.url}/${frontmatter.path} updated!`)
				} else {
					new Notice(`Error -- ${json?.data.pages.update.responseResult.slug} -- Code: ${json?.data.pages.update.responseResult.errorCode} -- Page not updated to wikijs!`)
				}
			} else if (json?.data?.pages?.delete?.responseResult) {
				if (json?.data.pages.delete.responseResult.succeeded) {
					new Notice(`Success -- Page ${settings.url}/${frontmatter.path} deleted!`)
				} else {
					new Notice(`Error -- ${json?.data.pages.delete.responseResult.slug} -- Code: ${json?.data.pages.delete.responseResult.errorCode} -- Page not deleted from wikijs!`)
				}
			} else if (json?.errors) {
				new Notice(`Unexpected error: ${json.errors[0].message}`);
			} else {
				new Notice(`Unknown error status: ${result.status} -- Error text: ${result.text}`)
			}
			return json;
		} catch (error: any) {
			new Notice(`Can't connect to ${settings.url} API. Is the API URL and Admin API Key correct? ${error.name}: ${error.message}`)
		}
	}
};

const wikiPostExists = async (uuidTag: string, settings: SettingsProp) => {
	let noteId: number = -1;
	try {
		wikijsReq.url = `${settings.url}/graphql`;
		wikijsReq.headers["Authorization"] = `Bearer ${settings.adminToken}`
		wikijsReq.body = JSON.stringify({ query: `{\n pages {\n list(tags: [\"${uuidTag}\"]) {\n id\n tags\n path\n }\n }\n}\n` })

		const result = await requestUrl(wikijsReq)

		const json = result.json;
		if (json?.data.pages?.list) {
			if (json.data.pages.list.length >= 1) {
				noteId = json.data.pages.list[0].id;
			}
		} else {
			new Notice("Page does not exist!")
		}
	} catch (error: any) {
		new Notice(`wikiPostExists error: ${error.name}: ${error.message}`)
	}
	return noteId;
}
