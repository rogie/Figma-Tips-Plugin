// This plugin will open a modal to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for the plugins. It has access to the *document*.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser enviroment (see documentation).

let width = 320
let height = 480
let fontName = { family: "Inter", style: "Semi Bold" }
let fontLight = { family: "Inter", style: "Regular"}
let bookmarks
let preferences 
let defaultPreferences = {
    showIntro: true,
    cache: {}
}


// This shows the HTML page in "ui.html".
figma.showUI(__html__, {width: width, height: height });

figma.loadFontAsync(fontName)
figma.loadFontAsync(fontLight)

figma.currentPage.setRelaunchData({ open: '' })

const figmaTips = {
    resize(data){
        let increment = (data.width - width)/20
        let heightIncrement = (data.height - height)/20
        let resizeInterval = setInterval(() => {
            width += increment
            height += heightIncrement
            figma.ui.resize(width, height)
            if(increment > 0 && width >= data.width || increment < 0 & width <= data.width){
                clearInterval(resizeInterval)
            }
        },5)
    },
    getVideoIdFromNode(node){
        let videoId = node.getSharedPluginData('figmaTips','videoId')

        // Extract tip from name
        if(!videoId && node.name.indexOf("Figma Tip:") > -1){
            videoId = node.name.replace('Figma Tip: ','')
        }

        return videoId
    },
    async loadBookmarks(){
        //let bookmarks = new Set(figma.clientStorage.getAsync('bookmarkedFigmaTips') == null? null: figma.clientStorage.getAsync('bookmarkedFigmaTips').split(','))
        bookmarks = await figma.clientStorage.getAsync('bookmarkedFigmaTips')

        figma.ui.postMessage({
            function: "bookmarksLoaded", 
            data: bookmarks
        })
    },
    async saveBookmarks(data){
        await figma.clientStorage.setAsync('bookmarkedFigmaTips',data.bookmarks)
    },
    play(videoId){
        figma.ui.postMessage({
            function: "play", 
            data: videoId
        })
    },
    async savePreferences(preferences){
        await figma.clientStorage.setAsync('preferences',preferences)
    },
    async loadPreferences(){
        preferences = await figma.clientStorage.getAsync('preferences')
        if(!preferences){
            preferences = defaultPreferences
            await figmaTips.savePreferences(preferences)
        }
        figma.ui.postMessage({
            function: "preferencesLoaded", 
            data: preferences
        })
    },
    async dropTip(data){
        const { dropPosition, windowSize, dragOffset, itemSize, video, imageBytes } = data;


        // Getting the position and size of the visible area of the canvas.
        const bounds = figma.viewport.bounds;
    
        // Getting the zoom level
        const zoom = figma.viewport.zoom;
    
        // There are two states of the Figma interface: With or without the UI (toolbar + left and right panes)
        // The calculations would be slightly different, depending on whether the UI is shown.
        // So to determine if the UI is shown, we'll be comparing the bounds to the window's width.
        // Math.round is used here because sometimes bounds.width * zoom may return a floating point number very close but not exactly the window width.
        const hasUI = Math.round(bounds.width * zoom) !== windowSize.width;
    
        // Since the left pane is resizable, we need to get its width by subtracting the right pane and the canvas width from the window width.
        const leftPaneWidth = windowSize.width - bounds.width * zoom - 240;
    
        // Getting the position of the cursor relative to the top-left corner of the canvas.
        const xFromCanvas = hasUI ? dropPosition.clientX - leftPaneWidth : dropPosition.clientX;
        const yFromCanvas = hasUI ? dropPosition.clientY - 40 : dropPosition.clientY;
    
        // Create a frame for the tip
        const frame = figma.createFrame()
        frame.name = "Figma Tip"
        frame.cornerRadius = 8
        frame.layoutMode = "VERTICAL"
        frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = 8
        frame.itemSpacing = 8
        frame.primaryAxisSizingMode = frame.counterAxisSizingMode = "AUTO"

        // Create a rectangle for the image
        const rect = figma.createRectangle();
    
        // Resize the rectangle to be the same size as the item from the plugin window.
        rect.resize(itemSize.width, itemSize.height);
        rect.cornerRadius = 4
        rect.locked = true
        rect.name = "Cover"
        frame.appendChild(rect)
        
        // TODO: Figure out how to get the paint struct from the typings file
        const newFills = []
        const paint = {
            blendMode: "NORMAL",
            filters: {exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0},
            imageHash: figma.createImage(imageBytes).hash,
            imageTransform: [[1, 0, 0],[0, 1, 0]],
            opacity: 1,
            scaleMode: "FILL",
            scalingFactor: 0.5,
            type: "IMAGE",
        }
        newFills.push(paint)
        rect.fills = newFills

        // Create a title 
        const title = figma.createText()
        title.fontName = fontName
        title.name = "Title"
        title.locked = true 
        title.insertCharacters(0,video.snippet.title)
        title.layoutAlign = "STRETCH"
        frame.appendChild(title)

        // Create instruction text
        const instructions = figma.createText()
        instructions.fontName = fontLight
        instructions.name = "Instructions"
        instructions.locked = true
        instructions.fontSize = 10
        instructions.layoutAlign = "STRETCH"
        instructions.insertCharacters(0,`★ Click "Play Figma Tip" in the properties panel`)
        frame.appendChild(instructions)
    
        // The canvas position of the drop point can be calculated using the following:
        frame.x = bounds.x + xFromCanvas / zoom - dragOffset.x;
        frame.y = bounds.y + yFromCanvas / zoom - dragOffset.y;
    
        // Select the rectangle
        figma.currentPage.appendChild(frame);
        figma.currentPage.selection = [frame];

        frame.setRelaunchData({ play: '' })
        frame.setSharedPluginData('figmaTips', 'videoId', video.id)

        figma.viewport.scrollAndZoomIntoView([frame])
    }
}

figmaTips.loadBookmarks()
figmaTips.loadPreferences()

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
figma.ui.onmessage = msg => {
    // One way of distinguishing between different types of messages sent from
    // your HTML page is to use an object with a "type" property like this.
    
    if(msg.function){
        figmaTips[msg.function](msg.data)
    }
    
};

// Launch tip if embedded on the node
if((figma.currentPage.selection && figma.currentPage.selection.length > 0)){

    let selection = figma.currentPage.selection[0]
    let videoId = figmaTips.getVideoIdFromNode(selection)

    switch(figma.command){
        case "play":
            figmaTips.play(videoId)
            break;
    }
}

