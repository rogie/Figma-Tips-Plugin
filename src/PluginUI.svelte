<script>

	//import Global CSS from the svelte boilerplate
	//contains Figma color vars, spacing vars, utility classes and more
	import { GlobalCSS } from 'figma-plugin-ds-svelte';

	import linkifyHtml from 'linkifyjs/html';

	import * as mixpanel from 'mixpanel-figma';

	//import some Svelte Figma UI components
	import { Icon, IconPlus, IconHyperlink, IconTwitter, IconClose, IconSpinner, IconButton, Button, IconBookmark, IconBookmarkFilled, Tabbar, Tab, Input, Label, SelectMenu, VisualBell } from 'figma-plugin-ds-svelte';

	import { onMount, tick, afterUpdate } from 'svelte';

	// Youtube api 
	let apiKeys = [
		"AIzaSyCVKOa1aU57kYFLWqVtwJVAOtCeU8QzVLs", // rking@figma.com
		//"AIzaSyAR3St6-9lIlJ60H2PNL1WWYsnX209UASg", // rogiek@gmail.com
		//"AIzaSyA3jOgmt1MjBW6qufW0af8zGI8HaFg1AnA"  // hi@rog.ie
	] 

	// Choose a random api key
	let apiKey = apiKeys[Math.floor(Math.random()*apiKeys.length)]

	let preferences = {
		showIntro: true,
		cache: {}
	}

	let playlistIds = ["PLXDU_eVOJTx53btRMBES-ASBBm03-bUCJ","PLXDU_eVOJTx5m3U10Q_iZEVn4LjcO3fsK"]

	let videos = []
	let playlist = []
	let allCategories = ["Auto layout", "Images", "Components", "FigJam", "Variants", "Design systems", "Illustration", "Vectors", "Project management", "Prototyping", "Shortcuts", "Components", "Styles"]
	let availableCategories = []
	let tags = []
	let loaded = false 
	let searchQuery = ''
	let selectedVideo = null
	let videoId = null
	let categoryTabs = [{label: 'All', selected: true},{label: 'Saved', selected: false}]
	let tagFilter = 'All'
	let dragOffset
	let bookmarks = []
	let visualBell 
	const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
	let defaultFooterLink = {
		href: "https://youtube.com/figmadesign",
		title: "Watch more Figma videos on YouTube"
	}

	$: footerLink = defaultFooterLink

	$: filteredVideos = videos.filter( (video) => {
		if(searchQuery && searchQuery.length > 0){
			let searchMatch = new RegExp(searchQuery,'ig') 
			let tags = video.snippet.tags? video.snippet.tags.join(",") : ""
			let found = tags.match(searchMatch) ||
					video.snippet.title.match(searchMatch) || 
					video.snippet.description.match(searchMatch)
			return found
		} else if(tagFilter === 'Saved'){
			return bookmarks.indexOf(video.id) > -1
		} else if(tagFilter !== 'All'){
			if(!video.snippet.tags){
				return false
			} else {
				let videoMatchesTag = video.snippet.tags.join(",").toLowerCase().split(",").includes(tagFilter.toLowerCase())
				return videoMatchesTag
			}
		} else {
			return video 
		}
	});

	// Encoding an image is also done by sticking pixels in an
	// HTML canvas and by asking the canvas to serialize it into
	// an actual PNG file via canvas.toBlob().
	async function encode(canvas, ctx, imageData) {
		ctx.putImageData(imageData, 0, 0)
		return await new Promise((resolve, reject) => {
			canvas.toBlob(blob => {
			const reader = new FileReader()
			reader.onload = () => resolve(new Uint8Array(reader.result))
			reader.onerror = () => reject(new Error('Could not read from blob'))
			reader.readAsArrayBuffer(blob)
			})
		})
	}

	async function decodeImage(canvas,ctx,url) {
		const image = await new Promise((resolve, reject) => {
			const img = new Image()
			img.crossOrigin = "Anonymous"
			img.onload = () => resolve(img)
			img.onerror = () => reject()
			img.src = url
		})
		canvas.width = image.width
		canvas.height = image.height
		ctx.drawImage(image, 0, 0)
		const imageData = ctx.getImageData(0, 0, image.width, image.height)
		return imageData
	}

	// filter
	function filterTabChanged(event){
		tagFilter = event.detail.label
		stopViewingVideo()
	}

	function savePreferences(){
		parent.postMessage({ pluginMessage: { 
			function: 'savePreferences', 
			data: preferences
		} }, '*')
	}

	function dismissIntro(){
		preferences.showIntro = false
		savePreferences()
	}

	function saveBookmarks(){
		parent.postMessage({ pluginMessage: { 
			function: 'saveBookmarks', 
			data: { bookmarks: bookmarks }
		} }, '*')
	}

	function loadBookmarks(){
		parent.postMessage({ pluginMessage: { 
			function: 'loadBookmarks'
		} }, '*')
	}

	function bookmarksLoaded(data){
		if(data && data.constructor == Array){
			bookmarks = data
		}
	}
	function preferencesLoaded(data){
		preferences = data
		loadVideos()
	}
	window.savePreferences = savePreferences
	window.preferencesLoaded = preferencesLoaded
	window.bookmarksLoaded = bookmarksLoaded

	// Bookmark video
	function toggleBookmark(video){
		let foundIndex = bookmarks.indexOf(video.id)
		if(foundIndex > -1){
			bookmarks.splice(foundIndex, 1);
			visualBell.show("Tip removed from saved videos")
		} else {
			bookmarks.push(video.id)
			visualBell.show("Tip added to saved videos")
		}
		bookmarks = bookmarks
		saveBookmarks()
		mixpanel.default.track("Bookmark video", {
			id: video.id,
			title: video.snippet.title,
			categoryId: video.snippet.categoryId,
			channelId: video.snippet.channelId,
			channelTitle: video.snippet.channelTitle,
			tags: video.snippet.tags, 
			duration: video.contentDetails.duration,
			caption: video.contentDetails.caption
		});
	}

	function getVideoData(videos){
		let videoIds = videos.map( video => video.contentDetails.videoId)
		return fetch(`https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&part=contentDetails,snippet&maxResults=50&id=${videoIds.join(",")}`)
	}

	function getPlaylistVideos(playlistId){
		return fetch(`https://www.googleapis.com/youtube/v3/playlistItems?key=${apiKey}&part=contentDetails&maxResults=50&playlistId=${playlistId}`)
	}

	function getVideoTags(videos){
		let allTags = []
		videos.forEach( video => allTags = allTags.concat(video.snippet.tags))
		
		return [... new Set(allTags)]
	}	

	function stopViewingVideo(){
		selectedVideo = null
		parent.postMessage({ pluginMessage: { 
			function: 'resize', 
			data: {
				width: 320,
				height: 480
			} 
		} }, '*')
	}

	async function viewVideo(video){
		if(video == selectedVideo)
			return
		await tick()
		selectedVideo = video
		document.location.hash = video.id
		parent.postMessage({ pluginMessage: { 
			function: 'resize', 
			data: {
				width: 640,
				height: 640
			} 
		} }, '*')
		trackEvent("Video play", video)
	}

	function dragVideo(e,video){
		// Getting the offset position (The position of the cursor relative to the top-left corner of item being dragged)
		dragOffset = {
			x: e.offsetX,
			y: e.offsetY
		}
	}

	async function videoDragged(e, video){
		// Don't proceed if the item was dropped inside the plugin window.
		if (e.view.length === 0) return;

		// Getting the position of the cursor relative to the top-left corner of the browser page (Where the hamburger icon is)
		const dropPosition = {
			clientX: e.clientX,
			clientY: e.clientY
		};

		// Getting the size of the app/browser window.
		const windowSize = {
			width: window.outerWidth,
			height: window.outerHeight
		};

		const itemSize = {
			width: e.target.clientWidth,
			height: e.target.clientHeight
		};

		const imageData = await decodeImage(canvas, ctx,video.snippet.thumbnails.maxres.url)
		const imageBytes = await encode(canvas, ctx, imageData)

		// Sending the variables over to the main code.
		parent.postMessage({ pluginMessage: { 
			function: 'dropTip', 
			data: { dropPosition, windowSize, dragOffset, itemSize, video, imageBytes }
		} }, '*')

	}

	async function addTipToCanvas(video){

		// Getting the size of the app/browser window.
		const windowSize = {
			width: window.outerWidth,
			height: window.outerHeight
		};

		// Getting the position of the cursor relative to the top-left corner of the browser page (Where the hamburger icon is)
		const dropPosition = {
			clientX: window.outerWidth/2,
			clientY: window.outerHeight/2
		};

		const itemSize = {
			width: 140,
			height: 78
		};
		dragOffset = {
			x: 0,
			y: 0
		}

		const imageData = await decodeImage(canvas, ctx,video.snippet.thumbnails.maxres.url)
		const imageBytes = await encode(canvas, ctx, imageData)

		// Sending the variables over to the main code.
		parent.postMessage({ pluginMessage: { 
			function: 'dropTip', 
			data: { dropPosition, windowSize, dragOffset, itemSize, video, imageBytes }
		} }, '*')

		visualBell.show("Video added to canvas")

		trackEvent("Add tip to canvas", video)
	}

	function getVideoLink(video){
		return `https://www.youtube.com/watch?v=${video.id}`
	}

	function trackEvent(eventName, video){
		mixpanel.default.track(eventName, {
			id: video.id,
			title: video.snippet.title,
			categoryId: video.snippet.categoryId,
			channelId: video.snippet.channelId,
			channelTitle: video.snippet.channelTitle,
			tags: video.snippet.tags, 
			duration: video.contentDetails.duration,
			caption: video.contentDetails.caption
		});
	}

	function copyLink(video){
		const el = document.createElement('textarea')
		el.value = getVideoLink(video)
		document.body.appendChild(el)
		el.select()
		document.execCommand('copy')
		document.body.removeChild(el)
		visualBell.show("Link copied to clipboard")
		trackEvent("Copy link", video)
	}

	function getAvailableCategories(tags){
		let lCaseTags = tags.join(",").toLowerCase().split(",")
		return allCategories.filter(category => lCaseTags.includes(category.toLowerCase()))
	}

	function getVideoThumb(video){
		let thumbnails = video.snippet.thumbnails
		let quality = thumbnails.maxres? thumbnails.maxres : (thumbnails.standard? thumbnails.standard :(thumbnails.high? thumbnails.high : thumbnails.default))
		return quality.url
	}

	async function getPlaylistVideoData(playlistId){
		const playlistResponse = await getPlaylistVideos(playlistId)
		playlist = await playlistResponse.json()

		const videoResponse = await getVideoData(playlist.items)
		const videoData = await videoResponse.json()

		return videoData.items
	}

	async function loadVideos(){
		let cached = preferences.cache && preferences.cache.videos && preferences.cache.videos.length > 0
		let expired = true 
		if(cached){
			let cachedDate = new Date(preferences.cache.date);
			let cacheExpiry = cachedDate.setDate(cachedDate.getDate() + 1) // Cache for one day
			let now = new Date()
			if(now < cacheExpiry){
				expired = false
			}
		}
		if(cached && !expired){
			videos = preferences.cache.videos
		} else {
			for(var i=0;i<playlistIds.length;++i){
				const videoItems = await getPlaylistVideoData(playlistIds[i])
				videos = [...videos,...videoItems]
			}
			preferences.cache = {}
			preferences.cache.videos = videos
			preferences.cache.date = new Date().getTime()
			savePreferences()
		}
		
		tags = getVideoTags(videos)

		// find available categories
		availableCategories = getAvailableCategories(tags)
		
		// setup the tabs
		availableCategories.forEach( category => categoryTabs.push({label: category,selected: false}))

		// set global loaded flag
		loaded = true 

		if(videoId){
			viewVideo(videos.find( video => video.id == videoId))
		}
	}

	onMount(async () => {
		

	});

	window.play = function(videoToPlay){
		videoId = videoToPlay
	}

	// Handle comms from figma plugin
	window.onmessage = async (event) => {

		if(event.data.pluginMessage){
			let msg = event.data.pluginMessage

			if(msg.function){
				window[msg.function](msg.data)
			}

		}
	}

	// Mixpanel analytics
	// disabling via config just in case
	mixpanel.default.init('f05278b632f986c91a4604d4e555ddb1', {
		disable_cookie: true,
		disable_persistence: true
	})

</script>

{#if loaded}
	{#if categoryTabs.length > 1}
	<Tabbar 
		class="categories" 
		sticky="true"
		search="true"
		searchPlaceholder="Search for a topic"
		on:tabChange="{filterTabChanged}"
		bind:tabItems="{categoryTabs}"
		bind:query="{searchQuery}">
	</Tabbar>
	{/if}
	{#if preferences.showIntro && tagFilter == "All" && !searchQuery}
	<div class="message intro">
		<div class="message-header">
			<div class="message-title">
				<!--svg title="I'm Tippy!" class="tippy" width="26" height="22" viewBox="0 0 26 22" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M1.30185 3.01428L0.803566 2.97275L0.803365 2.97533L1.30185 3.01428ZM1.33435 2.68868L0.840442 2.61085L0.840442 2.61085L1.33435 2.68868ZM1.30185 3.01428L1.80012 3.0558L1.80033 3.05322L1.30185 3.01428ZM1.20502 4.20556L0.706425 4.16812L0.706425 4.16812L1.20502 4.20556ZM1.20502 15.1401L0.706425 15.1775L0.706425 15.1775L1.20502 15.1401ZM1.30184 16.3313L0.80357 16.3729L0.80357 16.3729L1.30184 16.3313ZM1.30185 16.3314L1.80012 16.2899L1.80012 16.2899L1.30185 16.3314ZM1.33435 16.657L0.840442 16.7348L0.840442 16.7348L1.33435 16.657ZM3.16379 18.3403L3.20034 17.8416L3.20033 17.8416L3.16379 18.3403ZM11.3412 19.8224L11.6947 19.4688L11.6947 19.4688L11.3412 19.8224ZM14.1696 19.8224L13.8161 19.4688L13.8161 19.4688L14.1696 19.8224ZM24.731 16.7373L24.2328 16.6958L24.731 16.7373ZM24.731 2.60832L24.2328 2.64984L24.2328 2.64984L24.731 2.60832ZM3.16379 1.00535L3.12724 0.506687L3.12724 0.506687L3.16379 1.00535ZM15.0605 18.9314L14.707 18.5779L15.0605 18.9314ZM15.6779 18.4218L15.4865 17.9598L15.6779 18.4218ZM10.4502 18.9314L10.0967 19.285L10.4502 18.9314ZM9.83292 18.4218L10.0243 17.9598L9.83292 18.4218ZM1.80012 3.0558C1.81491 2.87834 1.82042 2.81622 1.82825 2.76651L0.840442 2.61085C0.825491 2.70572 0.81693 2.81247 0.803573 2.97275L1.80012 3.0558ZM1.80033 3.05322L1.80033 3.05322L0.803365 2.97533L0.803364 2.97534L1.80033 3.05322ZM1.70362 4.24301C1.72578 3.94789 1.75041 3.65234 1.80012 3.0558L0.803573 2.97276C0.753988 3.56777 0.728966 3.86799 0.706425 4.16812L1.70362 4.24301ZM1.70362 15.1026C1.43213 11.4879 1.43213 7.8578 1.70362 4.24301L0.706425 4.16812C0.431192 7.83277 0.431192 11.5129 0.706425 15.1775L1.70362 15.1026ZM1.80012 16.2898C1.75041 15.6933 1.72578 15.3978 1.70362 15.1026L0.706425 15.1775C0.728966 15.4777 0.753988 15.7779 0.80357 16.3729L1.80012 16.2898ZM1.80012 16.2899L1.80012 16.2898L0.80357 16.3729L0.803573 16.3729L1.80012 16.2899ZM1.82825 16.5792C1.82042 16.5294 1.81491 16.4673 1.80012 16.2899L0.803573 16.3729C0.81693 16.5332 0.825491 16.6399 0.840442 16.7348L1.82825 16.5792ZM3.20033 17.8416C2.5052 17.7907 1.93675 17.2676 1.82825 16.5791L0.840442 16.7348C1.02127 17.8823 1.96869 18.7541 3.12724 18.839L3.20033 17.8416ZM3.49096 17.8457C3.31289 17.8457 3.25053 17.8453 3.20034 17.8416L3.12724 18.839C3.22303 18.846 3.33012 18.8457 3.49096 18.8457V17.8457ZM9.03602 17.8457H3.49096V18.8457H9.03602V17.8457ZM11.6947 19.4688L10.8038 18.5779L10.0967 19.285L10.9876 20.1759L11.6947 19.4688ZM12.7554 20.3224C12.7016 20.3224 12.6202 20.3076 12.4462 20.1749C12.2607 20.0333 12.0381 19.8122 11.6947 19.4688L10.9876 20.1759C11.311 20.4993 11.5883 20.7781 11.8397 20.9699C12.1026 21.1705 12.395 21.3224 12.7554 21.3224V20.3224ZM13.8161 19.4688C13.4727 19.8122 13.25 20.0333 13.0645 20.1749C12.8906 20.3076 12.8092 20.3224 12.7554 20.3224V21.3224C13.1158 21.3224 13.4082 21.1705 13.6711 20.9699C13.9225 20.7781 14.1998 20.4993 14.5232 20.1759L13.8161 19.4688ZM14.707 18.5779L13.8161 19.4688L14.5232 20.1759L15.4141 19.285L14.707 18.5779ZM22.9831 17.8457H16.4748V18.8457H22.9831V17.8457ZM24.2328 16.6958C24.1786 17.3457 23.6353 17.8457 22.9831 17.8457V18.8457C24.1554 18.8457 25.132 17.9471 25.2293 16.7789L24.2328 16.6958ZM24.2328 2.64984C24.6223 7.32374 24.6223 12.0219 24.2328 16.6958L25.2293 16.7789C25.6234 12.0497 25.6234 7.29596 25.2293 2.5668L24.2328 2.64984ZM22.9831 1.5C23.6353 1.5 24.1786 1.99991 24.2328 2.64984L25.2293 2.5668C25.132 1.39858 24.1554 0.5 22.9831 0.5V1.5ZM3.49096 1.5H22.9831V0.5H3.49096V1.5ZM3.20033 1.50401C3.25053 1.50033 3.31289 1.5 3.49096 1.5V0.5C3.33012 0.5 3.22303 0.499667 3.12724 0.506687L3.20033 1.50401ZM1.82825 2.76651C1.93675 2.07801 2.5052 1.55496 3.20033 1.50401L3.12724 0.506687C1.96869 0.591593 1.02127 1.46335 0.840442 2.61085L1.82825 2.76651ZM15.4141 19.285C15.732 18.9671 15.7987 18.9129 15.8692 18.8837L15.4865 17.9598C15.1895 18.0829 14.9672 18.3177 14.707 18.5779L15.4141 19.285ZM16.4748 17.8457C16.1068 17.8457 15.7835 17.8368 15.4865 17.9598L15.8692 18.8837C15.9397 18.8545 16.0252 18.8457 16.4748 18.8457V17.8457ZM9.03602 18.8457C9.48557 18.8457 9.57106 18.8545 9.64158 18.8837L10.0243 17.9598C9.72724 17.8368 9.40397 17.8457 9.03602 17.8457V18.8457ZM10.8038 18.5779C10.5436 18.3177 10.3213 18.0829 10.0243 17.9598L9.64158 18.8837C9.71209 18.9129 9.7788 18.9671 10.0967 19.285L10.8038 18.5779Z" fill="black"/>
					<path d="M15.7016 9.63647C15.7016 9.36033 15.4778 9.13647 15.2016 9.13647C14.9255 9.13647 14.7016 9.36033 14.7016 9.63647H15.7016ZM11.3652 9.63647C11.3652 9.36033 11.1414 9.13647 10.8652 9.13647C10.5891 9.13647 10.3652 9.36033 10.3652 9.63647H11.3652ZM14.7016 9.63647C14.7016 10.2592 14.4864 10.6583 14.2023 10.9077C13.9074 11.1664 13.4908 11.3047 13.0334 11.3047V12.3047C13.6814 12.3047 14.3489 12.1094 14.8618 11.6593C15.3854 11.1998 15.7016 10.5148 15.7016 9.63647H14.7016ZM13.0334 11.3047C12.5761 11.3047 12.1594 11.1664 11.8646 10.9077C11.5805 10.6583 11.3652 10.2592 11.3652 9.63647H10.3652C10.3652 10.5148 10.6814 11.1998 11.205 11.6593C11.718 12.1094 12.3855 12.3047 13.0334 12.3047V11.3047Z" fill="black"/>
					<path d="M6.71489 8.8922C6.81791 8.48012 7.18816 8.19104 7.61291 8.19104V8.19104C8.03767 8.19104 8.40792 8.48012 8.51094 8.8922L8.51996 8.92831C8.63621 9.39329 8.63621 9.87974 8.51996 10.3447L8.51094 10.3808C8.40792 10.7929 8.03767 11.082 7.61291 11.082V11.082C7.18816 11.082 6.81791 10.7929 6.71489 10.3808L6.70586 10.3447C6.58961 9.87973 6.58961 9.39329 6.70586 8.92831L6.71489 8.8922Z" fill="black"/>
					<path d="M17.5557 8.8922C17.6587 8.48012 18.029 8.19104 18.4537 8.19104V8.19104C18.8785 8.19104 19.2487 8.48012 19.3518 8.8922L19.3608 8.92831C19.477 9.39329 19.477 9.87974 19.3608 10.3447L19.3518 10.3808C19.2487 10.7929 18.8785 11.082 18.4537 11.082V11.082C18.029 11.082 17.6587 10.7929 17.5557 10.3808L17.5467 10.3447C17.4304 9.87973 17.4304 9.39329 17.5467 8.92831L17.5557 8.8922Z" fill="black"/>
				</svg-->
					<svg title="I'm Tippy!" class="tippy" width="19" height="15" viewBox="0 0 19 15" fill="none" xmlns="http://www.w3.org/2000/svg">
						<mask id="path-1-outside-1" maskUnits="userSpaceOnUse" x="7" y="6" width="5" height="4" fill="black">
						<rect fill="white" x="7" y="6" width="5" height="4"/>
						<path d="M9.5 8.5C10.2622 8.5 10.9952 8.04147 11 7.01016C11 7.00463 10.9955 7 10.99 7H8.01C8.00448 7 8 7.00463 8.00002 7.01016C8.0048 8.04147 8.7378 8.5 9.5 8.5Z"/>
						</mask>
						<path d="M9.5 8.5C10.2622 8.5 10.9952 8.04147 11 7.01016C11 7.00463 10.9955 7 10.99 7H8.01C8.00448 7 8 7.00463 8.00002 7.01016C8.0048 8.04147 8.7378 8.5 9.5 8.5Z" fill="black"/>
						<path d="M11 7.01016L10.4 7.00736V7.00737L11 7.01016ZM8.00002 7.01016L7.40003 7.01294L8.00002 7.01016ZM10.4 7.00737C10.3983 7.36944 10.2753 7.57125 10.1395 7.68973C9.99102 7.81932 9.76708 7.9 9.5 7.9V9.1C9.99513 9.1 10.5188 8.95142 10.9285 8.59392C11.351 8.2253 11.5969 7.68219 11.6 7.01294L10.4 7.00737ZM9.5 7.9C9.23292 7.9 9.00898 7.81932 8.86045 7.68973C8.72467 7.57125 8.60169 7.36944 8.60002 7.00737L7.40003 7.01294C7.40313 7.68219 7.64904 8.2253 8.0715 8.59392C8.48122 8.95142 9.00487 9.1 9.5 9.1V7.9ZM8.01 7.6H10.99V6.4H8.01V7.6ZM8.60002 7.00737C8.60148 7.324 8.34714 7.6 8.01 7.6V6.4C7.66181 6.4 7.39851 6.68526 7.40003 7.01294L8.60002 7.00737ZM11.6 7.01295C11.6015 6.68526 11.3382 6.4 10.99 6.4V7.6C10.6529 7.6 10.3985 7.32401 10.4 7.00736L11.6 7.01295Z" fill="black" mask="url(#path-1-outside-1)"/>
						<path d="M5.12873 6.48507C5.2 6.19999 5.45615 6 5.75 6C6.04385 6 6.3 6.19999 6.37127 6.48507L6.37751 6.51005C6.45793 6.83173 6.45793 7.16827 6.37751 7.48995L6.37127 7.51493C6.3 7.80001 6.04385 8 5.75 8C5.45615 8 5.2 7.80001 5.12873 7.51493L5.12249 7.48995C5.04207 7.16827 5.04207 6.83173 5.12249 6.51005L5.12873 6.48507Z" fill="black"/>
						<path d="M12.6287 6.48507C12.7 6.19999 12.9561 6 13.25 6C13.5439 6 13.8 6.19999 13.8713 6.48507L13.8775 6.51005C13.9579 6.83173 13.9579 7.16827 13.8775 7.48995L13.8713 7.51493C13.8 7.80001 13.5439 8 13.25 8C12.9561 8 12.7 7.80001 12.6287 7.51493L12.6225 7.48995C12.5421 7.16827 12.5421 6.83173 12.6225 6.51005L12.6287 6.48507Z" fill="black"/>
						<path d="M1.38399 2.41865L1.75769 2.4498L1.38399 2.41865ZM1.38399 11.6316L1.75769 11.6005L1.75769 11.6005L1.38399 11.6316ZM7.89336 13.6109L7.6282 13.8761L7.6282 13.8761L7.89336 13.6109ZM17.5927 11.9125L17.9664 11.9436L17.9664 11.9436L17.5927 11.9125ZM17.5927 2.13781L17.9664 2.10666L17.9664 2.10666L17.5927 2.13781ZM11.3391 13.1013L11.1956 12.7548L11.3391 13.1013ZM11.3391 13.1013L11.1956 12.7548L11.1956 12.7548L11.3391 13.1013ZM7.27604 13.1013L7.41955 12.7548L7.27604 13.1013ZM1.75769 2.4498C1.80713 1.8565 2.3031 1.40015 2.89845 1.40015V0.650146C1.91303 0.650146 1.09212 1.4055 1.01028 2.38751L1.75769 2.4498ZM1.75769 11.6005C1.50395 8.55554 1.50395 5.49475 1.75769 2.4498L1.01028 2.38751C0.753083 5.47392 0.753083 8.57637 1.01028 11.6628L1.75769 11.6005ZM2.89845 12.6501C2.3031 12.6501 1.80713 12.1938 1.75769 11.6005L1.01028 11.6628C1.09212 12.6448 1.91303 13.4001 2.89845 13.4001V12.6501ZM6.47914 12.6501H2.89845V13.4001H6.47914V12.6501ZM8.15853 13.3458L8.15852 13.3458L7.62819 13.8761L7.6282 13.8761L8.15853 13.3458ZM9.30757 14.2359C9.21542 14.2359 9.10769 14.204 8.9226 14.0628C8.72887 13.915 8.49936 13.6866 8.15853 13.3458L7.6282 13.8761C7.95403 14.2019 8.22452 14.4736 8.46767 14.6591C8.71947 14.8512 8.98551 14.9859 9.30757 14.9859V14.2359ZM10.4566 13.3458C10.1158 13.6866 9.88628 13.915 9.69254 14.0628C9.50745 14.204 9.39972 14.2359 9.30757 14.2359V14.9859C9.62964 14.9859 9.89568 14.8512 10.1475 14.6591C10.3906 14.4736 10.6611 14.2019 10.987 13.8761L10.4566 13.3458ZM16.3834 12.6501H12.136V13.4001H16.3834V12.6501ZM17.219 11.8813C17.1828 12.3159 16.8195 12.6501 16.3834 12.6501V13.4001C17.2096 13.4001 17.8978 12.7669 17.9664 11.9436L17.219 11.8813ZM17.219 2.16895C17.4883 5.40081 17.4883 8.64948 17.219 11.8813L17.9664 11.9436C18.2392 8.67031 18.2392 5.37998 17.9664 2.10666L17.219 2.16895ZM16.3834 1.40015C16.8195 1.40015 17.1828 1.7344 17.219 2.16895L17.9664 2.10666C17.8978 1.28339 17.2096 0.650146 16.3834 0.650146V1.40015ZM2.89845 1.40015H16.3834V0.650146H2.89845V1.40015ZM10.987 13.8761C11.2976 13.5654 11.3838 13.4887 11.4826 13.4477L11.1956 12.7548C10.9269 12.8661 10.724 13.0784 10.4566 13.3458L10.987 13.8761ZM12.136 12.6501C11.7578 12.6501 11.4643 12.6435 11.1956 12.7548L11.4826 13.4477C11.5814 13.4068 11.6967 13.4001 12.136 13.4001V12.6501ZM11.4826 13.4477C11.4826 13.4477 11.4826 13.4477 11.4826 13.4477L11.1956 12.7548C11.1956 12.7548 11.1956 12.7548 11.1956 12.7548L11.4826 13.4477ZM6.47914 13.4001C6.91849 13.4001 7.0337 13.4068 7.13254 13.4477L7.41955 12.7548C7.15084 12.6435 6.8573 12.6501 6.47914 12.6501V13.4001ZM8.15852 13.3458C7.89113 13.0784 7.68826 12.8661 7.41955 12.7548L7.13254 13.4477C7.23137 13.4887 7.31753 13.5654 7.62819 13.8761L8.15852 13.3458Z" fill="black"/>
						</svg>
						
					
				<strong>Hullo, I'm Tippy!</strong>
			</div>
			<IconButton class="message-dismiss" title="Dismiss introduction" on:click={dismissIntro} iconName={IconClose}/>
		</div>
		<p>
			Figma Tips is a plugin that helps you up your design game in Figma! 
			You can save tips that are helpful, as well as add tips to the canvas to 
			help others learn too! 
		</p>
	</div>
	{/if}
	<ul class="playlist">
		{#each filteredVideos as video}
			<li 
				id="{video.id}"
				class="playlist-video" 
				class:selected="{selectedVideo && video.id === selectedVideo.id}">				
				<figure 
					draggable
					on:dragstart="{dragVideo(event,video)}"
					on:dragend="{videoDragged(event,video)}"
					on:click="{viewVideo(video)}">
					{#if selectedVideo && video.id === selectedVideo.id}
						<div class="playlist-video-titlebar">
							<strong class="playlist-video-title">{video.snippet.title}</strong>
						</div>
					{/if}
					<div class="media" title="Drag onto the canvas to save">
						<div class="youtube-aspect-ratio">
							{#if selectedVideo && video.id === selectedVideo.id}
								<iframe title="{video.snippet.title}" src="https://www.youtube.com/embed/{video.id}?autoplay=1"></iframe>
							{:else}
								<img alt="{video.snippet.title}" src="{getVideoThumb(video)}" /> 
							{/if}
						</div>
					</div>					
					<figcaption>
						{#if (selectedVideo && video.id !== selectedVideo.id) || !selectedVideo}
							<strong class="playlist-video-title">{video.snippet.title}</strong>
							<p class="line-clamp">{video.snippet.description}</p>
						{:else}
							<p>{@html linkifyHtml(video.snippet.description)}</p>
						{/if}
					</figcaption>
					{#if selectedVideo && video.id === selectedVideo.id}
						<div class="video-actions">
							<a on:click="{addTipToCanvas(video)}">
								<Icon iconName={IconPlus} color="white4"/>
								Add to canvas
							</a>
							<a on:click="{copyLink(video)}">
								<Icon iconName={IconHyperlink} color="white4"/>
								Copy link
							</a>
							<a target="_blank" href="https://twitter.com/intent/tweet?url={getVideoLink(video)}&text={encodeURIComponent(video.snippet.title + ' #FigmaTip')}">
								<Icon iconName={IconTwitter} color="white4"/>
								Tweet
							</a>
						</div>
					{/if}
				</figure>
				<div class="playlist-video-actions">
					{#if bookmarks.indexOf(video.id) > -1}
						<IconButton title="You've saved this tip" class="icon-button-selected" on:click={toggleBookmark(video)} iconName={IconBookmarkFilled}/>
					{:else}
						<IconButton title="Save this tip" class="icon-button" on:click={toggleBookmark(video)} iconName={IconBookmark}/>
					{/if}
					{#if selectedVideo && video.id === selectedVideo.id}
						<IconButton title="Close this tip" class="icon-button" on:click={stopViewingVideo(video)} iconName={IconClose}/>
					{/if}
				</div>
			</li>
		{:else}
			<li class="playlist-empty">
				<svg class="tippy" width="18" height="15" viewBox="0 0 18 15" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M1.19161 2.39351L1.56531 2.42465L1.19161 2.39351ZM1.19161 11.6065L1.56531 11.5754L1.56531 11.5753L1.19161 11.6065ZM7.70098 13.5858L7.43582 13.851L7.43582 13.851L7.70098 13.5858ZM17.4003 11.8873L17.774 11.9185L17.774 11.9185L17.4003 11.8873ZM17.4003 2.11266L17.774 2.08152L17.774 2.08152L17.4003 2.11266ZM11.1467 13.0761L11.0032 12.7297L11.1467 13.0761ZM11.1467 13.0761L11.0032 12.7297L11.0032 12.7297L11.1467 13.0761ZM7.08366 13.0761L7.22717 12.7297L7.08366 13.0761ZM1.56531 2.42465C1.61475 1.83135 2.11072 1.375 2.70607 1.375V0.625C1.72065 0.625 0.899735 1.38035 0.817901 2.36237L1.56531 2.42465ZM1.56531 11.5753C1.31156 8.53039 1.31156 5.46961 1.56531 2.42465L0.817901 2.36237C0.5607 5.44877 0.5607 8.55123 0.817901 11.6376L1.56531 11.5753ZM2.70607 12.625C2.11072 12.625 1.61475 12.1686 1.56531 11.5754L0.817901 11.6376C0.899735 12.6196 1.72065 13.375 2.70607 13.375V12.625ZM6.28676 12.625H2.70607V13.375H6.28676V12.625ZM7.96615 13.3206L7.96614 13.3206L7.43581 13.851L7.43582 13.851L7.96615 13.3206ZM9.11519 14.2108C9.02304 14.2108 8.91531 14.1789 8.73022 14.0377C8.53648 13.8898 8.30697 13.6615 7.96615 13.3206L7.43582 13.851C7.76165 14.1768 8.03214 14.4484 8.27529 14.6339C8.52709 14.826 8.79312 14.9608 9.11519 14.9608V14.2108ZM10.2642 13.3206C9.92341 13.6615 9.6939 13.8898 9.50016 14.0377C9.31507 14.1789 9.20734 14.2108 9.11519 14.2108V14.9608C9.43725 14.9608 9.70329 14.826 9.95509 14.6339C10.1982 14.4484 10.4687 14.1768 10.7946 13.851L10.2642 13.3206ZM16.1911 12.625H11.9436V13.375H16.1911V12.625ZM17.0266 11.8562C16.9904 12.2907 16.6271 12.625 16.1911 12.625V13.375C17.0172 13.375 17.7054 12.7418 17.774 11.9185L17.0266 11.8562ZM17.0266 2.1438C17.2959 5.37567 17.2959 8.62433 17.0266 11.8562L17.774 11.9185C18.0468 8.64516 18.0468 5.35483 17.774 2.08152L17.0266 2.1438ZM16.1911 1.375C16.6271 1.375 16.9904 1.70925 17.0266 2.1438L17.774 2.08152C17.7054 1.25825 17.0172 0.625 16.1911 0.625V1.375ZM2.70607 1.375H16.1911V0.625H2.70607V1.375ZM10.7946 13.851C11.1052 13.5403 11.1914 13.4635 11.2902 13.4226L11.0032 12.7297C10.7345 12.841 10.5316 13.0532 10.2642 13.3206L10.7946 13.851ZM11.9436 12.625C11.5655 12.625 11.2719 12.6184 11.0032 12.7297L11.2902 13.4226C11.3891 13.3816 11.5043 13.375 11.9436 13.375V12.625ZM11.2902 13.4226C11.2902 13.4226 11.2902 13.4226 11.2902 13.4226L11.0032 12.7297C11.0032 12.7297 11.0032 12.7297 11.0032 12.7297L11.2902 13.4226ZM6.28676 13.375C6.72611 13.375 6.84132 13.3816 6.94015 13.4226L7.22717 12.7297C6.95846 12.6184 6.66491 12.625 6.28676 12.625V13.375ZM7.96614 13.3206C7.69875 13.0532 7.49588 12.841 7.22717 12.7297L6.94015 13.4226C7.03898 13.4635 7.12514 13.5403 7.43581 13.851L7.96614 13.3206Z" fill="black"/>
					<path d="M11.3076 8.47485C11.3076 8.751 11.0838 8.97485 10.8076 8.97485C10.5315 8.97485 10.3076 8.751 10.3076 8.47485H11.3076ZM8.30762 8.47485C8.30762 8.751 8.08376 8.97485 7.80762 8.97485C7.53147 8.97485 7.30762 8.751 7.30762 8.47485H8.30762ZM10.3076 8.47485C10.3076 8.08346 10.1743 7.85138 10.0146 7.71125C9.84424 7.56176 9.59466 7.47485 9.30762 7.47485V6.47485C9.78527 6.47485 10.2857 6.61872 10.6742 6.95961C11.0733 7.30986 11.3076 7.82778 11.3076 8.47485H10.3076ZM9.30762 7.47485C9.02057 7.47485 8.77099 7.56176 8.60064 7.71125C8.44095 7.85138 8.30762 8.08346 8.30762 8.47485H7.30762C7.30762 7.82778 7.54193 7.30986 7.94106 6.95961C8.32954 6.61872 8.82996 6.47485 9.30762 6.47485V7.47485Z" fill="black"/>
					<path d="M4.93635 6.45992C5.00762 6.17484 5.26376 5.97485 5.55762 5.97485C5.85147 5.97485 6.10762 6.17485 6.17888 6.45992L6.18513 6.48491C6.26555 6.80659 6.26555 7.14312 6.18513 7.4648L6.17888 7.48978C6.10761 7.77486 5.85147 7.97485 5.55762 7.97485C5.26376 7.97485 5.00762 7.77486 4.93635 7.48978L4.9301 7.4648C4.84968 7.14312 4.84968 6.80659 4.9301 6.48491L4.93635 6.45992Z" fill="black"/>
					<path d="M12.4363 6.45992C12.5076 6.17484 12.7638 5.97485 13.0576 5.97485C13.3515 5.97485 13.6076 6.17485 13.6789 6.45992L13.6851 6.48491C13.7656 6.80659 13.7656 7.14312 13.6851 7.4648L13.6789 7.48978C13.6076 7.77486 13.3515 7.97485 13.0576 7.97485C12.7638 7.97485 12.5076 7.77486 12.4363 7.48978L12.4301 7.4648C12.3497 7.14312 12.3497 6.80659 12.4301 6.48491L12.4363 6.45992Z" fill="black"/>
					<path d="M4.94721 9.60557L5.36617 8.76766C5.42131 8.65738 5.57869 8.65738 5.63383 8.76766L6.05279 9.60557C6.25825 10.0165 5.95944 10.5 5.5 10.5C5.04056 10.5 4.74175 10.0165 4.94721 9.60557Z" fill="black"/>
				</svg>					
				{#if tagFilter == "Saved"}
					<p>You haven't saved any tips.</p>
				{:else}
					<p>No tips found.</p>
				{/if}
			</li>
		{/each}
	</ul>
	<footer class="plugin-footer">
		<a href="{footerLink.href}" target="_new">
			{footerLink.title}
		</a>
	</footer>
	<VisualBell bind:this="{visualBell}"/>
{:else}
	<div class="plugin-loading">
		<Icon iconName={IconSpinner} color="black3" spin/>
	</div>
{/if}

<style>
:root{
	--hairline: 1px solid var(--silver);
	scroll-behavior: smooth;
	transition: all 300ms ease-in-out;
	scroll-padding: 40px 0 40px 0;
	--hover-fill: #daebf7;
	font-family: 'Inter', sans-serif;
	font-size: var(--font-size-xsmall);
	--black5: #888;
}

:global(body,html){
	height: 100%;
	width: 100%;
	font-family: 'Inter', sans-serif;
	font-size: var(--font-size-xsmall);
	color: var(--black8);
}
:global(body){
	padding: 0 0 40px 0;
	height: auto;
}
:global(strong){
	font-weight: medium;
}

:global(.tabbar-nav){
	background:transparent !important;
}
:global(.tabbar),
.plugin-footer{
	background: rgba(255,255,255,0.9) !important;
	backdrop-filter: blur(10px) !important;
}
:global(.tabbar .tab.selected){
	background: rgba(0,0,0,0.05) !important;
}

/* Intro */
.message{
	background: rgba(151,71,255,.1);
	border-radius: var(--border-radius-large);
	display: flex;
	padding: var(--size-xsmall);
	margin: var(--size-xxsmall) var(--size-xsmall);
	align-items: center;
	flex-direction: column;
	align-items: stretch;
}
.message .message-header{
	display: flex; 
	align-items: center;
	justify-content: space-between;
}
.message .message-title{
	display: flex;
	align-items: center;
}
.message p:last-of-type{
	margin-bottom: 0;
}

.message.intro .tippy{
	flex-shrink: 0;
	margin: calc(-1 * var(--size-xxsmall)) 0;
	margin-right: var(--size-xxsmall);
}
.message.intro .tippy path{
	fill: currentColor;
}
:global(.message-dismiss){
	margin: calc(-1 * var(--size-xxsmall));
}
:global(.message-dismiss:hover){
	background: rgba(0,0,0,0.05) !important;
}
/*
:global(.message-dismiss){
	color: var(--white);
	margin: calc(-1 * var(--size-xxsmall));
}

:global(.message-dismiss .icon-component){
	color: var(--white) !important;
	fill: var(--white) !important;
 }*/

/* Add additional global or scoped styles here */
.playlist{
  list-style: none;
  margin: 0; 
  padding: 0;
}

.playlist li{
	margin: 0;
	padding: 0;
	position: relative;
	cursor: pointer;
}
.playlist-video{
	position: relative;
}
.playlist-video:hover{
	
}
.playlist li>a{
	color: inherit;
	text-decoration: none !important;
}
.playlist .playlist-empty{
	color: var(--black3);
	text-align: center;
	cursor: auto;
	display: flex;
	align-items: center;
	flex-direction: column;
	padding: var(--size-medium);
}
.playlist-video figure{
	padding: var(--size-xxsmall) var(--size-xsmall);
	margin: 0;
	display: flex;
}


.playlist-video figure figcaption{
	align-self: center;
}
.playlist-video figure iframe{
	border: 0;
}
.playlist-video figure .media{
	width: 140px;
	display: block;
	margin: 0 var(--size-xxsmall) 0 0;
	align-self: flex-start;
	border-radius: var(--border-radius-large);
	overflow: hidden;
	flex-shrink: 0;
	cursor: grabbing;
}
.playlist-video figure p{
	margin: 0.25rem 0;
}
.playlist-video figure p:last-of-type{
	margin-bottom: 0;
}

.playlist-video.selected{
	border-bottom: var(--hairline);
	margin-bottom: 0;
	color: var(--white);
	background: var(--black8-opaque) !important;
}
.playlist-video.selected figure{
	flex-direction: column;
	padding: 0;
}

.playlist-video.selected figure .media{
	width: 100%;
	margin: 0;
	border-radius: 0;
	padding: 0 var(--size-xsmall);
}
.playlist-video.selected figure .media iframe{
	border-radius: var(--border-radius-med);
	overflow: hidden;
}
.playlist-video.selected figure figcaption{
	align-self: stretch;
	padding: var(--size-xsmall);
}
.playlist-video.selected figure figcaption p{
	color: var(--black3-opaque);
}
.playlist-video.selected figure figcaption{
	line-height: 1.4;;
}

.playlist-video-titlebar{
	padding: var(--size-xxsmall) var(--size-xsmall);
	font-weight: 600;
    box-sizing: border-box;
    height: 41px;
    display: flex;
    justify-content: space-between;
	align-items: center;
}

/* Tippy! */
.tippy{
	width: 28px;
	height: 28px;
}
.tippy path{
	fill: var(--black8);
}

/* Selected video actions */
.video-actions{
	padding: 0 var(--size-xsmall) var(--size-xsmall) var(--size-xsmall);
	display: flex;
}
.video-actions a{
	display: flex;
	align-items: center;
	color: var(--white8);
	padding: 0 var(--size-xxsmall) 0 calc(var(--size-xxsmall)/4);
	border-radius: var(--border-radius-med);
	border: 1px solid var(--white4);
	margin-right: var(--size-xxsmall);
}
.video-actions a :global(.icon-component){
	color: currentColor !important;
	fill: currentColor !important;
	cursor: pointer;
	width: 24px;
	height: 24px;
}
.video-actions a:hover{
	color: var(--white);
	border: 1px solid #222;
	background:#222222;
}

/* Playlist video actions */
.playlist-video-actions{
	position: absolute;
	right: 0;
	top: 0;
	bottom: 0;
	padding: var(--size-xsmall);
	display: flex; 
	align-items: center;
	justify-content: center;
	background: var(--white);
	opacity: 0;
	background: linear-gradient(to right, transparent 0px, var(--white) calc(var(--size-xsmall)),var(--white));
}
.playlist-video:hover .playlist-video-actions{
	opacity:1;
}
.playlist-video-actions :global(.icon-button:hover),
.playlist-video-actions :global(.icon-button-selected:hover){
	background: transparent;
}
.playlist-video-actions :global(.icon-button .icon-component){
	color: var(--black5) !important;
	fill: var(--black5) !important;
}
.playlist-video-actions :global(.icon-button:hover .icon-component){
	color: var(--black) !important;
	fill: var(--black) !important;
}
.playlist-video.selected .playlist-video-actions{
	bottom: auto;
	height: 41px;
	background: none;
	opacity: 1;
	padding: 0 var(--size-xxsmall);
}
.playlist-video.selected .playlist-video-actions :global(.icon-button .icon-component){
	color: var(--white4) !important;
	fill: var(--white4) !important;
}
.playlist-video.selected .playlist-video-actions :global(.icon-button:hover .icon-component),
.playlist-video.selected .playlist-video-actions :global(.icon-button-selected .icon-component){
	color: var(--white) !important;
	fill: var(--white) !important;
}



.prevent-word-break {

	/* These are technically the same, but use both */
	overflow-wrap: break-word;
	word-wrap: break-word;

	-ms-word-break: break-all;
	/* This is the dangerous one in WebKit, as it breaks things wherever */
	word-break: break-all;
	/* Instead use this non-standard one: */
	word-break: break-word;

	/* Adds a hyphen where the word breaks, if supported (No Blink) */
	-ms-hyphens: auto;
	-moz-hyphens: auto;
	-webkit-hyphens: auto;
	hyphens: auto;
}

.line-clamp {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;  
	overflow: hidden;
	word-break: break-all;
}
.youtube-aspect-ratio{
	position: relative;
	width: 100%;
  	padding-bottom: 56.25%;
}
.youtube-aspect-ratio>* {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	border: 0;
}

.plugin-footer{
	padding: 1rem var(--size-xsmall);
	position: fixed;
	bottom: 0;
	margin: 0;
	left: 0;
	right: 0;
	background: var(--white);
	box-shadow: 0 -1px 0 rgba(0,0,0,0.1);
	border-radius: 0 0 var(--border-radius-small) var(--border-radius-small);
}
.plugin-footer a{
	font-size: var(--font-size-xsmall);
	line-height: var(--font-line-height);
}
.plugin-footer a:after{
	content: ' →';
}

.plugin-loading{
	position: fixed;
	top:0;
	right:0;
	bottom:0;
	left:0;
	background: var(--white);
	align-items: center;
	justify-content: center;
	display: flex;
}

</style>