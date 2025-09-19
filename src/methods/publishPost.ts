/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, DataProp } from "./../types/index";
import { MarkdownView, Notice, requestUrl, RequestUrlParam, Vault } from "obsidian";

const matter = require("gray-matter");
const UUID_TAG_HDR = "o2w-";

//https://github.com/alangrainger/share-note/blob/main/src/note.ts
//const formData = new FormData();
//formData.append('mediaUpload','')

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
	body: ""
}

export const publishPost = async (view: MarkdownView, vaul: Vault ,settings: SettingsProp) => {
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

        getImages((<DataProp>data).content, vaul)

		let content_reconfig = configCalloutContent((<DataProp>data).content)

		const content_filtered = content_reconfig
			.replace(/^ {0,3}> ?\[\!info\]/gmi,"> {.is-info}")
			.replace(/^ {0,3}> ?\[\!warning\]/gmi,"> {.is-warning}")
			.replace(/^ {0,3}> ?\[\!danger\]/gmi,"> {.is-danger}")
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

const configCalloutContent = (content: string): string => {
	const calloutTagLineNums: number[] = []
    let calloutTagType = -1 
	const input_lines = content.split('\n')
	const output_lines = content.split('\n')
	let obsidMainTagIndex = 0
	let wikiMainTagIndex = 0

	//console.log("\ninput_lines:\n" + input_lines)

	input_lines.forEach((element, i, localArr) => {
		element += '\n'
		output_lines[i] += '\n'
		calloutTagLineNums.push(calloutTagType)

		if (calloutTagType == -1) {
			var found = element.search(/^ {0,3}> ?\[\!info\][ ]*[\n]|^ {0,3}> ?\[\!warning\][ ]*[\n]|^ {0,3}> ?\[\!danger\][ ]*[\n]/i)
			if (found != -1){
				if ( i == 0 || (i > 0 && localArr[i-1].search(/^ *>/i) == -1) ) {
					//console.log('Ind:' + i + ' Main Tag: ' + element)
					obsidMainTagIndex = i
					calloutTagType = -2

					if(localArr.length - 1 == i ){
						calloutTagLineNums[i] = i
					}
				}
			}
		} else if (calloutTagType == -2){
			if ( localArr[i].search(/^ *>/i) != -1 ){
				//console.log('Ind:' + i + ' Sub Tag: '+ element)
			} else {
				wikiMainTagIndex = i-1
				calloutTagLineNums[obsidMainTagIndex] = wikiMainTagIndex
				
				calloutTagType = -1
				obsidMainTagIndex = 0
				wikiMainTagIndex = 0
			}
		}
	});

	let calloutTagsExist = calloutTagLineNums.some((val)=>{
		return val >= 0
	})

	if (!calloutTagsExist){
		return content
	}

	let captured_tag: string
	let new_content:string
	calloutTagLineNums.forEach((element, indx)=>{
		if (element >= 0) {
			captured_tag = output_lines.splice(indx,1)[0]
			output_lines.splice(element,0,captured_tag)
		}
	})

	output_lines.forEach((ele, indx)=>{
		if(indx == 0) { 
			new_content = ele 
		} else {
			new_content += ele
		}
	})

	//console.log("\noutput lines:\n ",output_lines)
	//console.log('\nNewContent:\n ' + new_content)
	return new_content
}

const getImages = ( content: string, vlt: Vault): string => {
    const re_imgLink = / {0,3}!?\[[\w/.#@-]+\]\([\w/:.-]+\)[\n]*/i; //regex to find img hyperlinks
	const contentLines = content.split('\n');
    
    for (const ln of contentLines) {
		var found = ln.search(re_imgLink);
		
		if (found == -1) {
			continue
		}
      
		//check if is a web image
        if ( ln.match(/\]\(https?:\/\/[\w/.-]+\)/) && !ln.match(/\]\(https?:\/\/localhost\/\)/) ) {
			//console.log('\nweb img: ' + ln);
			continue
	    }
		console.log('\nlocal img: ' + ln);

		let imgLink = ln.split(/\]\(/)
		let imgPath = imgLink[1].split(')')[0]
		let imgFname = imgPath.split('/')[imgPath.split('/').length - 1]
		let imgExt = imgFname.split('.')[imgFname.split('.').length - 1]

		//console.log('\nimgFname: ' + imgFname) 
		//console.log('\nimgExt: ' + imgExt) 
		//console.log('\nvfilesLength :' + vaultTfiles.length) 

	    for (const vltFile of vlt.getFiles()) {
			//console.log('\nimgFname: ' + imgFname + ' vltFileName: ' + vltFile.name ) 
		    if(imgFname == vltFile.name){
			  vlt.readBinary(vltFile)
		      console.log('\nvltFilename: ' + vltFile.name + ' size: ' + vltFile.stat.size + ' path: ' + vltFile.path + ' ext: ' + vltFile.extension )
			  break;
		    }
	    };
	}
    
	return contentLines[0]

// ![hello](/kk8k/.k/k)
// ![hello](_resources/AllClients-1.png)
// ![123](_resources/AllClients-1.png)
// [hellP](_resources/AllClients-1.png)
// ![](_resources/AllClients-1.png)
// ![hello](https://pages.expat.com)
// ![hello](http://pages.expat.com)
// ![hello](http://localhost/)
// ![hello](http://localhost)
//     ![hello](_resources/AllClients-1.png)
// ! [spaceAfterExclmation](kk8k)
// ![hello]()
// ![AfterExclamation] (spaceAfter])
// ![hello](/_kk8k/.k/k)
}

