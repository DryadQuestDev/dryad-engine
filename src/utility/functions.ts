import { jsonrepair } from "jsonrepair";
import { getFileExtensions } from "./schema";
/**
 * Resolves to the intrinsic pixel size of an image given its URL.
 */
export interface ImageSize {
    width: number;
    height: number;
}

/**
 * Loads an image off‑DOM and returns its natural dimensions.
 *
 * @param url  Absolute or relative URL of the image.
 * @param useCORS  Set to true if you might draw the image to a canvas later.
 */
export function getImageDimensions(
    url: string,
    useCORS: boolean = false
): Promise<ImageSize> {
    return new Promise<ImageSize>((resolve, reject) => {
        const img = new Image();

        if (useCORS) {
            // Needed only if the image comes from another origin *and*
            // you intend to use it on a canvas.
            img.crossOrigin = 'anonymous';
        }

        img.onload = () =>
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight,
            });

        img.onerror = () =>
            reject(console.warn(`Could not load image: ${url}`));

        img.src = url;      // Trigger the request **after** handlers are set.
    });
}

// --- Utility Functions ---

// Helper functions to determine file types
export function isImage(filename: string | null): boolean {
    if (!filename) return false;
    const imageExtensions = getFileExtensions('image');
    return imageExtensions.some(ext => filename.toLowerCase().endsWith('.' + ext));
}

export function isVideo(filename: string | null): boolean {
    if (!filename) return false;
    const videoExtensions = getFileExtensions('video');
    return videoExtensions.some(ext => filename.toLowerCase().endsWith('.' + ext));
}

export function parseText(text: string): Record<string, any>[] {
    if (!text) {
        return [];
    }

    text = text.replace(//g, "\n");

    // Extract and protect [code]...[/code] blocks before processing
    const codeBlockPlaceholders: string[] = [];
    const codeBlockRegex = /\[code\]([\s\S]*?)\[\/code\]/g;
    text = text.replace(codeBlockRegex, (match) => {
        const placeholder = `__CODE_BLOCK_${codeBlockPlaceholders.length}__`;
        codeBlockPlaceholders.push(match); // Store the full [code]...[/code] block
        return placeholder;
    });

    let room_id = "";

    let scene_name = "";
    let scene_row = 0;
    let scene_block = 0;
    let scene_paragraph = 0;
    let anchor = "";

    let fillingContent = false;
    let choice_counter = 1;
    let inside = "";
    //1 - scene, 2 - encounter, 3 - description, 4 - variable


    let vals = text.trim().split('\n');
    // console.log("vals:"+vals);

    let arr = [];
    let params = null;
    let paramsEncounter = null;

    let emptyParagraph = false;
    for (let paragraph of vals) {

        //paragraph = paragraph.trim();
        if (!paragraph.trim()) {
            emptyParagraph = true;
            //console.log("empty new paragraph")
            //continue;
        } else {
            emptyParagraph = false;
        }

        //remove any comments which start with //
        if (/^\/\//.test(paragraph)) {
            //out+= "\n";
            //out+= paragraph;
            continue;
        }

        let paragraphType = paragraph[0]; //^, @, !, $, #, %, >, ~, a number, or any other character
        let paragraphContent = paragraph.substring(1);
        //console.warn("paragraphType:"+paragraphType);

        //strip Json
        let match = null;
        if (["@", "!", "$", "#"].includes(paragraphType)) {    //, ">", "~"
            match = paragraph.match(/\{.*\}/);
            fillingContent = false;
        } else if ([">", "~"].includes(paragraphType)) {
            match = paragraph.match(/(?<!if)(?<!ifOr)(?<!else)(?<!fi)\{.*\}/);
            fillingContent = false;
        }
        if (match) {
            if (paragraphType == "@") {
                paramsEncounter = match[0];
            } else {
                params = match[0];
            }
            paragraphContent = paragraphContent.replace(match[0], "");
        }



        //enter an event table
        if (["@", "#", "$"].includes(paragraphType)) {
            inside = paragraphType;
        }

        //
        if (paragraphType != ">") {
            choice_counter = 1;
        }

        //main logic
        switch (paragraphType) {
            case "^": {
                paragraphContent = paragraphContent.replace(".", "").trim();
                room_id = paragraphContent;
            } break;

            case "#": {
                scene_name = paragraphContent;
                scene_row = 1;
                scene_block = 1;
                scene_paragraph = 1;
                anchor = "";
                inside = "#"; // Set context for subsequent lines
            } break;

            case "%": {
                scene_block++;
                scene_paragraph = 1;
                fillingContent = false;
                anchor = "";
            } break;

            case ">": {
                let s_p = scene_paragraph; // - 1;
                let id = ">" + room_id + "." + scene_name + "." + scene_row + "." + scene_block + "." + s_p + "*" + choice_counter;
                choice_counter++;
                arr.push({ id: id, val: paragraphContent, params: params });
                params = null;
                anchor = "";
            } break;

            case "~": {
                scene_block++;
                scene_paragraph = 1;
                let id = "~" + room_id + "." + scene_name + "." + scene_row + "." + scene_block;
                arr.push({ id: id, val: paragraphContent, params: params });
                params = null;
                anchor = "";
            } break;

            case "@": { // Encounter definition
                scene_name = paragraphContent.trim();
                let id = "@" + room_id + "." + scene_name;
                arr.push({ id: id, val: "", params: paramsEncounter });
                paramsEncounter = null; // Consume params for this encounter block
                inside = "@"; // Set context for subsequent lines
                // fillingContent remains managed by other types or general flow
            } break;

            case "!": {
                let val;
                let found = /^(.*)(<)(.*)(>)$/g.exec(paragraphContent);
                //console.log("found:"+found);
                let title;
                if (found == null) {
                    val = "__Default__:" + paragraphContent;
                    title = paragraphContent;
                } else {
                    val = found[3];
                    title = found[1];
                }
                let id = "!" + room_id + "." + scene_name + "." + title;
                arr.push({ id: id, val: val, params: params });
                params = null;
            } break;

            case "$": { // Template definition
                scene_name = paragraphContent.trim();
                let id = "$" + scene_name;
                arr.push({ id: id, val: "", params: params });
                params = null; // Consume params for this template block
                inside = "$"; // Set context for subsequent lines
                // fillingContent remains managed by other types or general flow
            } break;

            default: {

                let id = "";
                //emptyParagraph = false;
                //console.log("inside of "+inside+" +++"+paragraph);
                switch (inside) {
                    case "#": {
                        if (emptyParagraph) {
                            scene_paragraph++;
                            fillingContent = false;
                            anchor = "";
                        } else {
                            // if anchor
                            if (paragraphType == "&") {
                                anchor = paragraphContent;
                            } else {
                                let matchNumber = paragraph.match(/^\d*$/);//if a number
                                if (matchNumber) {
                                    scene_row = parseInt(matchNumber[0]);
                                    scene_block = 0;
                                    scene_paragraph = 1;
                                } else {//if text
                                    id = "#" + room_id + "." + scene_name + "." + scene_row + "." + scene_block + "." + scene_paragraph;
                                    if (fillingContent) {
                                        arr[arr.length - 1].val += paragraph;
                                    } else {
                                        arr.push({ id: id, val: paragraph, params: params, anchor: anchor });
                                        params = null;
                                    }
                                    fillingContent = true;
                                    params = null;
                                }
                            }
                        }
                    } break;
                    case "@":
                    case "$": {
                        let targetBlock = null;
                        // Find the last pushed block of the current 'inside' type (@ or $)
                        for (let i = arr.length - 1; i >= 0; i--) {
                            if (arr[i].id && arr[i].id[0] === inside) {
                                targetBlock = arr[i];
                                break;
                            }
                        }

                        if (targetBlock) {
                            if (emptyParagraph) {
                                targetBlock.val += "<br>";
                            } else {
                                // Actual content paragraph
                                if (targetBlock.val === "" && paragraph.trim() === "") {
                                    // Initial val is empty, and this content line is also empty/whitespace
                                    // Do nothing, val remains ""
                                } else if (targetBlock.val === "") {
                                    targetBlock.val = paragraph; // First piece of actual content
                                } else {
                                    // Subsequent content, append using original logic (direct concatenation)
                                    targetBlock.val += paragraph;
                                }
                            }
                        } else {
                            // This case should be rare if @ and $ declarations always push a block.
                            // Log if it was supposed to be actual content and no block was found.
                            if (!emptyParagraph && paragraph.trim() !== "") {
                                console.warn(`No target block found for content paragraph: "${paragraph}" when inside='${inside}'`);
                            }
                        }
                    } break;
                }


            }

        }
        //out = this.fillOut(out,id,paragraph);//change to ->
    }
    //console.log(arr);

    // Process each object in the array to finalize its structure and parse params
    const finalResultArray = arr.map(obj => finalizeParsedObject(obj, codeBlockPlaceholders));

    return finalResultArray;
}

function finalizeParsedObject(obj: any, codeBlockPlaceholders: string[]): any {

    if (obj.anchor == "") {
        delete obj.anchor;
    }

    if (obj.params == null) {
        delete obj.params;
    }



    // Ensure val is a string before attempting string operations
    if (obj.val && typeof obj.val === 'string') {
        // Restore [code] blocks from placeholders
        obj.val = obj.val.replace(/__CODE_BLOCK_(\d+)__/g, (match: string, index: string) => {
            return codeBlockPlaceholders[parseInt(index)] || match;
        });

        //remove unnecessary <br>
        obj.val = obj.val.replace(/(<br>)*$/g, "");

        //fix curly quotes inside HTML tags to normal quotes
        obj.val = obj.val.replace(/<[^>]*>/g, (tag: string) => {
            // Replace curly double quotes with normal double quotes
            return tag.replace(/[“”]/g, '"')
                // Replace curly single quotes with normal single quotes
                .replace(/[‘’]/g, "'");
        });
    }

    // Remove val property if it's an empty string
    if (obj.val === "") {
        delete obj.val;
    }

    if (obj.params && typeof obj.params === 'string') {
        let paramsStr = obj.params.replace(/[""]/gi, '"');

        //add quotes around object keys using jsonrepair
        paramsStr = paramsStr.replace(/\.(?!\d)/g, "__dot__");
        try {
            paramsStr = jsonrepair(paramsStr);
        } catch (e) {
            console.error("Error during jsonrepair for params: " + paramsStr, e);
            // obj.params remains the original string or could be set to an error state
        }

        paramsStr = paramsStr.replace(/__dot__/g, ".");
        try {
            obj.params = JSON.parse(paramsStr);
        } catch (e) {
            console.error("Error parsing params string to object: " + paramsStr, e);
            // If parsing fails, store the repaired string (or original) as fallback,
            // or set to null, or an error object.
            obj.params = paramsStr; // Fallback to the (potentially repaired) string
        }
    }

    // Anchor property does not require special processing based on original logic
    // id property is already set

    return obj;
}