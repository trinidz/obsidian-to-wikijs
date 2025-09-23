/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, DataProp, ImageFileFormats } from "../types";
import { MarkdownView, Notice, requestUrl, RequestUrlParam, Vault, getBlobArrayBuffer, TAbstractFile } from "obsidian";

const matter = require("gray-matter");
const UUID_TAG_HDR = "o2w-";

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

export const publishPost = async (view: MarkdownView, vlt: Vault ,settings: SettingsProp) => {
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

        ///TESTING START 
		let parsedContent = parseLinkedImageElements((<DataProp>data).content)
		uploadLinkedImages(view,vlt,settings) 
        ///TESTING END

		let content_reconfig = parseCalloutElements(parsedContent)

		const content_filtered = content_reconfig
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

/**
 * Convert Obsidian style callout elements to Wikijs style
 * - This method converts the 3 types of obsidian callout elements
 *  (info, warning and danger) that are compatible with wikijs.
 * 
 * > [!Info]
 * > example obsidian style callout
 * 
 * > example wikijs style callout
 * > {.is-info} 
 * 
 * @private
 * @param {string} noteContent Content of an obsidian note
 * @return {string} Content of the obsidian note with callouts converted to wikijs style 
 */
const parseCalloutElements = (noteContent: string): string => {
	const regex_obsCalloutTags = /^ {0,3}> ?\[\!info\][ ]*[\n]|^ {0,3}> ?\[\!warning\][ ]*[\n]|^ {0,3}> ?\[\!danger\][ ]*[\n]/i
	const calloutTagLineNums: number[] = []
    let calloutTagType = -1 
	const input_lines = noteContent.split('\n')
	const output_lines = noteContent.split('\n')
	let obsidMainTagIndex = 0
	let wikiMainTagIndex = 0

	//console.log("\ninput_lines:\n" + input_lines)

	input_lines.forEach((noteContentLn, i, localArr) => {
		noteContentLn += '\n'
		output_lines[i] += '\n'
		calloutTagLineNums.push(calloutTagType)

		if (calloutTagType == -1) {
			if (regex_obsCalloutTags.test(noteContentLn)){
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
		return noteContent
	}

	let captured_tag: string
	calloutTagLineNums.forEach((element, indx)=>{
		if (element >= 0) {
			captured_tag = output_lines.splice(indx,1)[0]
			output_lines.splice(element,0,captured_tag)
		}
	})

	let parsedContent = output_lines.join("")

	//console.log("\noutput lines:\n ", output_lines)
	//console.log('\nNewContent:\n ' + parsedContent)

	parsedContent = parsedContent.replace(/^ {0,3}> ?\[\!info\]/gmi,"> {.is-info}")
	.replace(/^ {0,3}> ?\[\!warning\]/gmi,"> {.is-warning}")
	.replace(/^ {0,3}> ?\[\!danger\]/gmi,"> {.is-danger}")

	return parsedContent
}

/**
 * Convert Obsidian linked image storage file paths to Wikijs storage file paths
 * 
 * @private
 * @param {string} noteContent Content of an obsidian note
 * @return {string} Content of the obsidian note with linked image obsidian storage file paths converted to wikijs image storage file paths 
 */
const parseLinkedImageElements = (noteContent: string): string  => {
	const re_imgHyperLink = /!?\[[\w/.#@-]+\]\([\w/:.-]+\)/i; //regex to find images in content included as hyperlinks !(myImageHyperLinkAlias)[pathToImageInVault]
	const re_imgDirectLink = /!?\[\[[\w/.#@-]+\]\]/i; //regex to find images in content included as direct links ![[pathToImageInVault]] 
	let contentLines = noteContent.split('\n');
    let parsedContentLines: string[] = []
    
    for (const contentLn of contentLines) {
		parsedContentLines.push(contentLn + '\n')

		if (!re_imgHyperLink.test(contentLn) && !re_imgDirectLink.test(contentLn) ) {
			continue
		}
      
		//check if is a web image; also web image does not work inside of [[]] type link so don't have to check
        if ( contentLn.match(/\]\(https?:\/\/[\w/.-]+\)/) && !contentLn.match(/\]\(https?:\/\/localhost\/\)/) ) {
			//console.log('\nweb img: ' + ln);
			continue
	    }
		console.log('\ncontent line with linked img: ' + contentLn);

		let imgLink: string[]
		let imgPath: string
		let imgFname: string
		let imgExt: string
		let parsedLine: string

		if(re_imgHyperLink.test(contentLn)){
			imgLink = contentLn.split(/\]\(/)
	        imgPath = imgLink[1].split(')')[0]
		    imgFname = imgPath.split('/')[imgPath.split('/').length - 1]
		    imgExt = imgFname.split('.')[imgFname.split('.').length - 1]
			const re_imgPath = new RegExp("\\]\\("+imgPath);
	        parsedLine = contentLn.replace(re_imgPath, "](/" + imgFname)
		} else {
			imgLink = contentLn.split(/\[\[/)
	        imgPath = imgLink[1].split(/\]\]/)[0]
		    imgFname = imgPath.split('/')[imgPath.split('/').length - 1]
		    imgExt = imgFname.split('.')[imgFname.split('.').length - 1]
			const re_imgPath = new RegExp("\\[\\["+imgPath+"\\]\\]");
	        parsedLine = contentLn.replace(re_imgPath, "[image](/" + imgFname + ")")
		}
		//console.log('\nimgPath: '+ imgPath + ' imgFname:' + imgFname)

		if (!ImageFileFormats.some(ele => ele === imgExt))
			continue

	   console.log('\nParsed Ln: ' + parsedLine)
	   
	   parsedContentLines.pop()
	   parsedContentLines.push(parsedLine+'\n')
    }

	//console.log("parsedContent: "+ parsedContentLines.join(""))
	return parsedContentLines.join("")
}

const getImages = async ( content: string, vlt: Vault): Promise<ArrayBuffer[]> => {
    const re_imgLink = / {0,3}!?\[[\w/.#@-]+\]\([\w/:.-]+\)[\n]*/i; //regex to find img hyperlinks
	let imgBinaries: ArrayBuffer[] = new Array()
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
  
		if (!ImageFileFormats.some(ele => {
			//console.log('\nbool: ' + ele === imgExt) 
			//console.log('\nExts: ' + imgExt + '===' + ele) 
			return ele === imgExt
		}))
			continue

		//console.log('\nimgFname: ' + imgFname) 
		//console.log('\nvfilesLength :' + vaultTfiles.length) 

	    for (const vltFile of vlt.getFiles()) {
			//console.log('\nimgFname: ' + imgFname + ' vltFileName: ' + vltFile.name ) 
		    if(imgFname === vltFile.name){
			  imgBinaries.push(await vlt.readBinary(vltFile))
			  console.log('\nimgBinariesLength: ' + imgBinaries[imgBinaries.length-1].byteLength + ' arraylength: ' + imgBinaries.length )
		      console.log('\nvltFilename: ' + vltFile.name + ' size: ' + vltFile.stat.size + ' path: ' + vltFile.path + ' ext: ' + vltFile.extension )
			  break;
		    }
	    };
	}
    
	return imgBinaries

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

//https://github.com/alangrainger/share-note/blob/main/src/note.ts
//https://github.com/requarks/wiki/discussions/6049
//https://github.com/djmango/obsidian-transcription/blob/cf5029b7f9aca97396a3befa2f963f15c87fabca/main.ts
const uploadLinkedImages = async (view: MarkdownView, vlt: Vault, settings: SettingsProp) => {
	// Get the current filepath
	const markdownFilePath = view.file.path;
	console.log('\nSearching image files in vault : ' + markdownFilePath);

	// Get all linked files in the markdown file
	const filesLinked = Object.keys(view.app.metadataCache.resolvedLinks[markdownFilePath]);
	console.log('\nimagesLinked: ' + filesLinked)

	// Now that we have all the files linked in the markdown file, we need to filter them by the file extensions
	const imagesToUpload: TAbstractFile[] = [];
	for (const linkedFilePath of filesLinked) {
		const linkedFileExtension = linkedFilePath.split('.').pop();
		if (linkedFileExtension === undefined || (!ImageFileFormats.some(ele => ele === linkedFileExtension))) {
			console.log('Skipping ' + linkedFilePath + ' because the file extension is not an accepted file extension');
			continue;
		}

		// We now know that the file extension is in the list of image file extensions
		const linkedFile = vlt.getAbstractFileByPath(linkedFilePath);

		// If the file is not found, we skip it
		if (linkedFile === null) {
			console.log('Could not find file ' + linkedFilePath);
			continue;
		}

		//console.log('\nlinkedFileName: ' + linkedFile.name)

		imagesToUpload.push(linkedFile)
	}
	// Now that we have all the images to upload, we can upload them
	for (const fileToTranscribe of imagesToUpload) {
		console.log('Uploading ' + fileToTranscribe.path);

		// This next block is a workaround to current Obsidian API limitations: requestURL only supports string data or an unnamed blob, not key-value formdata
		// Essentially what we're doing here is constructing a multipart/form-data payload manually as a string and then passing it to requestURL
		// I believe this to be equivilent to the following curl command: curl --location --request POST 'http://djmango-bruh:9000/asr?task=transcribe&language=en' --form 'audio_file=@"test-vault/02 Files/Recording.webm"'

		// Generate the form data payload boundry string, it can be arbitrary, I'm just using a random string here
		// https://stackoverflow.com/questions/3508338/what-is-the-boundary-in-multipart-form-data
		// https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
		const N = 16 // The length of our random boundry string
		const randomBoundryString = "djmangoBoundry" + Array(N + 1).join((Math.random().toString(36) + '00000000000000000').slice(2, 18)).slice(0, N)

		// Construct the form data payload as a string
		const form_data_payload_00 = `------${randomBoundryString}\r\nContent-Disposition: form-data; name=mediaUpload\r\n\r\n${JSON.stringify({ folderId: 0 })}`;
		const form_data_payload_01 = `\r\n------${randomBoundryString}\r\nContent-Disposition: form-data; name="mediaUpload"; filename=${fileToTranscribe.name}\r\nContent-Type: image/jpeg\r\n\r\n`
		const form_data_payload_end = `\r\n------${randomBoundryString}--`

		// Convert the form data payload to a blob by concatenating the pre_string, the file data, and the post_string, and then return the blob as an array buffer
		const form_data_payload_encoded_00 = new TextEncoder().encode(form_data_payload_00);
		const form_data_payload_encoded_01 = new TextEncoder().encode(form_data_payload_01);
		const data = new Blob([await vlt.adapter.readBinary(fileToTranscribe.path)]);
		const form_data_payload_encoded_end = new TextEncoder().encode(form_data_payload_end);
		const concatenated = await new Blob([form_data_payload_encoded_00, form_data_payload_encoded_01, await getBlobArrayBuffer(data), form_data_payload_encoded_end]).arrayBuffer()

		// Now that we have the form data payload as an array buffer, we can pass it to requestURL
		// We also need to set the content type to multipart/form-data and pass in the boundry string
		const options: RequestUrlParam = {
			method: 'POST',
			url: `${settings.url}/u`,
			contentType: `multipart/form-data; boundary=----${randomBoundryString}`,
			headers: {
				"Authorization": `Bearer ${settings.adminToken}`,
			},
			body: concatenated
		};

		requestUrl(options)
			.then(response => {
				if (response.status == 200) 
					console.log('\nUpload success: ' + response.text)
				else
					console.log('\nUpload failed: ' + response.status)
			})
			//{"succeeded":false,"message":"Missing upload folder metadata."}
			//.then(data => console.log('jsonData: ' + data))
			.catch(error => console.error('requestUrlError: ' + error));
	}
}