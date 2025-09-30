/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, DataProp, VaultImageFileFormats, VaultImageFileMetadata } from "./types";
import { MarkdownView, Notice, requestUrl, RequestUrlParam, Vault, getBlobArrayBuffer, TAbstractFile } from "obsidian";
import { shortHash256 } from "./crypto"

const matter = require("gray-matter");
const UUID_TAG_HDR = "o2w-";

export const publishPost = async (view: MarkdownView, vlt: Vault, settings: SettingsProp) => {
	const regex_ipAddress = /^(https?:\/\/)(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
	const regex_url = /^(https?:\/\/)[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/
	const regex_uuid = /^[a-zA-Z0-9]{7,21}$/
	const noteFile = view.app.workspace.getActiveFile();
	const metaMatter = view.app.metadataCache.getFileCache(noteFile).frontmatter;

	if (!regex_url.test(settings.url) && !regex_ipAddress.test(settings.url)) {
		new Notice("Invalid Wikijs URL. Please check your URL setting.")
		return
	} else if (settings.adminToken.length != 502) {
		new Notice("Invalid Wikijs API Key. Please check your API Key setting.")
		return
	} else if (!regex_uuid.test(metaMatter.uuid)) {
		new Notice("uuid is invalid or missing from document front matter.")
		return
	} else
		new Notice(`Connecting to ${settings.url} ...`);
	
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

	let tagArr = "["
	frontmatter.tags.forEach((tag: string) => { tagArr += `\"${tag}\",` });
	tagArr += `\"${UUIDTAG}\"]`

	let finishedContent = ""
	if (!frontmatter.tags.contains("delete")) {
		let upImagesMetadata = await uploadLinkedVaultImages(view, vlt, settings)
		let parsedContent = parseContentLinkedImages((<DataProp>data).content, upImagesMetadata)
		parsedContent = parseContentCallouts(parsedContent)
		finishedContent = parsedContent
			.replace(/\\/g, "/")
			.replace(/\"/g, "'")
			.replace(/\n/g, "\\n")
			.replace(/\r/g, "\\r")
			.replace(/\t/g, "\\t")
	}

	let graphqlAPIbody: string;
	try {
		if (frontmatter.tags.contains("delete")) {
			if (noteID == -1) {
				new Notice(`Can not delete. Page does not exist!`)
				return
			}
			graphqlAPIbody = JSON.stringify({ query: `mutation {pages { delete( id: ${noteID} ) {responseResult { succeeded slug errorCode message } } } }` })
		} else if (noteID == -1 || !frontmatter.update) {
			graphqlAPIbody = JSON.stringify({ query: `mutation {pages { create( path: "${frontmatter.path.replace(/\\/g, "/")}" title: "${frontmatter.title.replace(/\\/g, "/")}" description: "${frontmatter.short_desc.replace(/\\/g, "/")}" content: "${finishedContent}" editor: "${frontmatter.editor}" isPublished: ${frontmatter.public} isPrivate: ${frontmatter.private} tags: ${tagArr} locale: "${frontmatter.locale}" ) {responseResult { succeeded slug errorCode message } } }}` })
		} else {
			graphqlAPIbody = JSON.stringify({ query: `mutation {pages { update( id: ${noteID} path: "${frontmatter.path.replace(/\\/g, "/")}" title: "${frontmatter.title.replace(/\\/g, "/")}" description: "${frontmatter.short_desc.replace(/\\/g, "/")}" content: "${finishedContent}" editor: "${frontmatter.editor}" isPublished: ${frontmatter.public} isPrivate: ${frontmatter.private} tags: ${tagArr} locale: "${frontmatter.locale}" ) {responseResult { succeeded slug errorCode message } } }}` })
		}

		const wikijsReq: RequestUrlParam = {
			url: `${settings.url}/graphql`,
			method: "POST",
			contentType: "application/json",
			headers: {
				"Authorization": `Bearer ${settings.adminToken}`,
				"Content-Type": "application/json",
				"Accept": "application/json",
				"Connection": "keep-alive",
				"DNT": "1",
				//"Access-Control-Allow-Methods": "POST",
				"Accept-Encoding": "gzip, deflate, br",
				//"Origin": "https://wiki.example.org",
			},
			body: graphqlAPIbody
		}

		const result = await requestUrl(wikijsReq)
		const json = result.json;
		//console.log("\nContent upload response:\n" + JSON.stringify(result))
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
	} catch (error: any) {
		new Notice(`Can't connect to ${settings.url} API. Is the API URL and Admin API Key correct? ${error.name}: ${error.message}`)
	}
};

/**
 * Determine if a wikijs post exists 
 * 
 * @private
 * @param {string} uuidTag uuid tag of an obsidian note
 * @param {string} settings app settings
 * @return {Promise<number>} wikijs note id; returns -1 if not found
 */
const wikiPostExists = async (uuidTag: string, settings: SettingsProp): Promise<number> => {
	let noteId: number = -1;
	try {
		const wikijsReq: RequestUrlParam = {
			url: `${settings.url}/graphql`,
			method: "POST",
			contentType: "application/json",
			headers: {
				"Authorization": `Bearer ${settings.adminToken}`,
				"Content-Type": "application/json",
				"Accept": "application/json",
				"Connection": "keep-alive",
				"DNT": "1",
				"Accept-Encoding": "gzip, deflate, br",
			},
			body: JSON.stringify({ query: `{\n pages {\n list(tags: [\"${uuidTag}\"]) {\n id\n tags\n path\n }\n }\n}\n` })
		}

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
 * - 3 obsidian callout elements (info, warning and danger) are compatible with wikijs.
 * 
 * @private
 * @param {string} noteContent Content of an obsidian note
 * @return {string} Content of the obsidian note with callouts converted to wikijs style 
 */
const parseContentCallouts = (noteContent: string): string => {
	const regex_obsCalloutTags = /^ {0,3}> ?\[\!info\][ ]*[\n]|^ {0,3}> ?\[\!warning\][ ]*[\n]|^ {0,3}> ?\[\!danger\][ ]*[\n]/i
	const calloutTagLineNums: number[] = []
	const input_lines = noteContent.split('\n')
	const output_lines = noteContent.split('\n')
	let calloutTagType = -1 
	let obsidMainTagIndex = 0
	let wikiMainTagIndex = 0

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
	//console.log("\nparsed content lines:\n ", output_lines)
	//console.log('\nparsed content:\n ' + parsedContent)

	parsedContent = parsedContent.replace(/^ {0,3}> ?\[\!info\]/gmi,"> {.is-info}")
	.replace(/^ {0,3}> ?\[\!warning\]/gmi,"> {.is-warning}")
	.replace(/^ {0,3}> ?\[\!danger\]/gmi,"> {.is-danger}")

	return parsedContent
}

/**
 * Convert linked image file paths to Wikijs storage file paths
 * 
 * @private
 * @param {string} noteContent Content of an obsidian note
 * @param {VaultImageFileMetadata[]} upImagesMetadata Metadata for linked images uploaded to wikijs
 * @return {string} Content of the obsidian note with linked image obsidian storage file paths converted to wikijs image storage file paths 
 */
const parseContentLinkedImages = (noteContent: string, upImagesMetadata: VaultImageFileMetadata[]): string  => {
    const re_matchLinks = /(?<=!?\[\[)\/?[\w-]+(?:[\w/. -]*[\w-])?\.[a-zA-Z0-9]+(?=\]\])|(?<=!?\[[^\r\n\(\)\[\]]+\]\()\/?[\w-]+(?:[\w/. -]*[\w-])?\.[a-zA-Z0-9]+(?=\))/g
	const re_url = /(https?:\/\/)[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/
	//const re_imgHyperLink = /!?\[[^\r\n\(\)\[\]]+\]\(\/?[\w-]+(?:[\w/. -]*[\w-])?\.[a-zA-Z0-9]+\)/i; //regex to find images in content included as hyperlinks !(myImageHyperLinkAlias)[pathToImageInVault]
	//const re_imgDirectLink = /!?\[\[\/?[\w-]+(?:[\w/. -]*[\w-])?\.[a-zA-Z0-9]+\]\]/i; //regex to find images in content included as direct links ![[pathToImageInVault]] 
	let contentLines = noteContent.split('\n');
    let parsedContentLines: string[] = []
    
    for (const contentLn of contentLines) {
		parsedContentLines.push(contentLn + '\n')
    
		let matchedLinks = contentLn.match(re_matchLinks)
		if (matchedLinks === null)
			continue

		console.log('Matched content image links: ' + matchedLinks)

		let parsedContentLn = contentLn
		for (const mLink of matchedLinks) {
			//check if link to a web image
			if (re_url.test(mLink)) {
				console.log('\nSkipping linked web image content: ' + mLink);
				continue
			}
			//console.log('\nLinked image content found: ' + mLink);

			let obsImgFname = mLink.split('/')[mLink.split('/').length - 1]
			let obsImgExt = obsImgFname.split('.')[obsImgFname.split('.').length - 1]
			if (!VaultImageFileFormats.some(imgFmt => imgFmt === obsImgExt)) {
				console.log('\nBad parsed image format: ' + obsImgFname)
				continue
			}

			let wikijsImagePath = createWikijsImageFilePath(mLink, upImagesMetadata)
			if (wikijsImagePath === "") 
				wikijsImagePath = obsImgFname
			
			const re_imgPathHyper = new RegExp("\\]\\(" + mLink + "\\)");
			parsedContentLn = parsedContentLn.replace(re_imgPathHyper, `](/${wikijsImagePath})`)
			const re_imgPathDir = new RegExp("\\[\\[" + mLink + "\\]\\]");
			parsedContentLn = parsedContentLn.replace(re_imgPathDir, `[${obsImgFname}](/${wikijsImagePath})`)
		}

	    //console.log('\nParsed linked image line: ' + parsedLine)
	    parsedContentLines.pop()
	    parsedContentLines.push(parsedContentLn+'\n')
    }

	return parsedContentLines.join("")
}

/**
 * Upload linked images to wikijs storage
 * 
 * @private
 * @param {MarkdownView} view note markdown view
 * @param {Vault} vlt vault containing notes
 * @param {SettingsProp} settings app settings
 * @return {Promise<VaultImageFileMetadata[]>} 
 */
const uploadLinkedVaultImages = async (view: MarkdownView, vlt: Vault, settings: SettingsProp): Promise<VaultImageFileMetadata[]> => {
	// Get the current filepath
	const markdownFilePath = view.file.path;
	console.log('\nSearching image files in vault: ' + markdownFilePath);

	// Get all linked files in the markdown file
	const filesLinked = Object.keys(view.app.metadataCache.resolvedLinks[markdownFilePath]);
	console.log('\nLinked vault images: ' + filesLinked)

	// Now that we have all the files linked in the markdown file, we need to filter them by the file extensions
	const imagesToUpload: TAbstractFile[] = [];
	for (const linkedFilePath of filesLinked) {
		const linkedFileExtension = linkedFilePath.split('.').pop();
		if (linkedFileExtension === undefined || (!VaultImageFileFormats.some(imageFormat => imageFormat === linkedFileExtension))) {
			console.log('Skipping ' + linkedFilePath + ' because the file extension is not an accepted');
			continue;
		}

		// We now know that the file extension is in the list of image file extensions
		const linkedFile = vlt.getAbstractFileByPath(linkedFilePath);

		// If the file is not found, we skip it
		if (linkedFile === null) {
			console.log('Could not find file vault image ' + linkedFilePath);
			continue;
		}

		imagesToUpload.push(linkedFile)
	}

	let upImages: VaultImageFileMetadata[] = []
	let successUpImages = 0 
	// Now that we have all the images to upload, we can upload them
	for (const imgToUpload of imagesToUpload) {
		const imgToUploadArrBuffer = await vlt.adapter.readBinary(imgToUpload.path)
		const imgToUploadSHA256 = await shortHash256(imgToUploadArrBuffer)
		const imgToUploadWikijsFilename = imgToUploadSHA256 + '.' +  imgToUpload.name.split('.').pop()
		//console.log('Uploading (' + imgToUploadWikijsFilename + ') ' + imgToUpload.path);

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
		const form_data_payload_01 = `\r\n------${randomBoundryString}\r\nContent-Disposition: form-data; name="mediaUpload"; filename=${imgToUploadWikijsFilename}\r\nContent-Type: image/jpeg\r\n\r\n`
		const form_data_payload_end = `\r\n------${randomBoundryString}--`

		// Convert the form data payload to a blob by concatenating the pre_string, the file data, and the post_string, and then return the blob as an array buffer
		const form_data_payload_encoded_00 = new TextEncoder().encode(form_data_payload_00);
		const form_data_payload_encoded_01 = new TextEncoder().encode(form_data_payload_01);
		const data = new Blob([imgToUploadArrBuffer]);
		const form_data_payload_encoded_end = new TextEncoder().encode(form_data_payload_end);
		const imageBlob = await new Blob([form_data_payload_encoded_00, form_data_payload_encoded_01, await getBlobArrayBuffer(data), form_data_payload_encoded_end]).arrayBuffer()

		//https://github.com/alangrainger/share-note/blob/main/src/note.ts
        //https://github.com/requarks/wiki/discussions/6049
        //https://github.com/djmango/obsidian-transcription/blob/cf5029b7f9aca97396a3befa2f963f15c87fabca/main.ts
		// Now that we have the form data payload as an array buffer, we can pass it to requestURL
		// We also need to set the content type to multipart/form-data and pass in the boundry string
		const options: RequestUrlParam = {
			method: 'POST',
			url: `${settings.url}/u`,
			contentType: `multipart/form-data; boundary=----${randomBoundryString}`,
			headers: {
				"Authorization": `Bearer ${settings.adminToken}`,
			},
			body: imageBlob
		};

		try {
			const result = await requestUrl(options)
			if (result.status == 200) {
				//success response from wikijs image upload is string "ok"
				successUpImages++
				upImages.push({
                    abstractFile: imgToUpload,
					sha256: imgToUploadSHA256,
					ext: imgToUpload.path.split('.').pop(),
				})
				//console.log('\nImage upload success: (' + imgToUploadWikijsFilename + ') - ' + imgToUpload.path)
			} else {
				//{"succeeded":false,"message":"Missing upload folder metadata."}
				console.log('\nVault image upload error: (' + imgToUploadWikijsFilename + ') - ' + imgToUpload.path)
				console.log("\nVault image upload error resp:\n" + result.json)
			}
		} catch (error: any) {
			console.log('\nVault image upload failed: (' + imgToUploadWikijsFilename + ') - ' + imgToUpload.path)
			console.log('\nVault image upload failed:\n' + error)
		}
	}

	if(imagesToUpload.length > 0)
		new Notice(`${successUpImages} of ${imagesToUpload.length} images uploaded to ${settings.url}.`);

	return upImages
}

/**
 * Create a file path for image in wikijs storage
 * 
 * @private
 * @param {string} contentImageFilePath image file path in obsidian note
 * @param {Vault} vaultImageMetadatas metadata of vault linked images
 * @return {string} 
 */
const createWikijsImageFilePath = (contentImageFilePath: string, vaultImageMetadatas: VaultImageFileMetadata[]): string => {	
	const pathlengths = vaultImageMetadatas.map(a => a.abstractFile.path.split('/').length)
    const index = pathlengths.indexOf(Math.max(...pathlengths));
	const maxShifts = vaultImageMetadatas[index].abstractFile.path.split('/').length
	
	let wikiImgFilePath = ""
	let cImageFilePathArr = contentImageFilePath.split('/')

	for (let numShifts = 0; numShifts < maxShifts; numShifts++) {
		vaultImageMetadatas.forEach(vImageMetadata => {
			let vImageFilePathArr = vImageMetadata.abstractFile.path.split('/')
			if (numShifts < vImageFilePathArr.length) {
				for (let i = 0; i < numShifts; i++) {
					vImageFilePathArr.shift()
				}

				if (cImageFilePathArr.join("") === vImageFilePathArr.join("")) {
					wikiImgFilePath = vImageMetadata.sha256 + '.' + vImageMetadata.ext
					//console.log("\nwikijs file path created: " + contentImageFilePath + ' - hash: ' + wikiImgFilePath)
					numShifts = maxShifts
					return
				}
			} 
		})
	}

	if (wikiImgFilePath == "")
		console.log("\nwikijs file path not generated for: " + contentImageFilePath)
	return wikiImgFilePath
}


