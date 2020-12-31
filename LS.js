/* (c) 2020 by Hypervariety Custom Programming. All rights reserved. */
"use strict";

var hh;

function hh_init()
{
	hh = 
	{ 
		state: { },	// event properties. 'state' is used for too many things now
		files: { },
		connected: !!document.head.querySelector("meta[name='hh:servertime']"),
		standalone: !!(navigator.standalone || window.matchMedia('(display-mode: standalone)').matches),
		username: getCookie('username'),
		file_lists_downloaded: [],
		document_title: document.title,
		url: { full: '', href: '', user: '', path: '' },	// { href:"user/person/folder/file", user:"person", path:"folder/file" } or { href:"file", user:"", path:"file" }
		tool: 'user',
		pointerType: 'mouse',
		color: '--text-color',	// should just be blank for text color
		undoables: [], 
		undoables_count: 0,
		testbed: String(getComputedStyle(document.documentElement).getPropertyValue('--testbed')),
		desktop_safari: (navigator.vendor.indexOf('Apple') != -1) && (navigator.userAgent.indexOf('Mobile')==-1),
		helloworld(debug) {
			if (debug) debugger;
			alert('Hello world');
		}
	}

	if (hh.standalone) 
		document.body.setAttribute('data-hh-standalone', true);

	var files_changes = JSON.parse(localStorage.getItem('files_changes') || '{}');
	Object.keys(files_changes).forEach((f) => { 
		hh.files[f] = hh.files[f] || {};
		hh.files[f].changes = files_changes[f];
	});
	var files_state = JSON.parse(localStorage.getItem('files_state') || '{}');
	Object.keys(files_state).forEach((f) => { 
		hh.files[f] = hh.files[f] || {};
		hh.files[f].state = files_state[f];
	});
}

function hh_event_properties(event)
{
	var state = { };
	state.type = event.type;
	state.time = Date.now();	// event.timeStamp doesn't work
	state.meta = !!((event.metaKey!==undefined) ? event.metaKey : hh.state.meta);
	state.shift = !!((event.shiftKey!==undefined) ? event.shiftKey : hh.state.shift);
	state.alt = !!((event.altKey!==undefined) ? event.altKey : hh.state.alt);
	state.ctrl = !!((event.ctrlKey!==undefined) ? event.ctrlKey : hh.state.ctrl);
	state.keyCode = (event.keyCode!==undefined) ? event.keyCode : hh.state.keyCode;
	state.tool = hh.tool;
	state.double_click = (event.detail===2 || event.detail_polyfill===2 );
	state.triple_click = (event.detail===3 || event.detail_polyfill===3);
	state.pressure = (event.touches && event.touches[0] && event.touches[0]["force"]) || 1.0;
	
	// state.client is from [0,0] to the size of the viewport in CSS pixels, but includes scroll in chrome.
	// this is what coordinate the paint tool prefers.
	state.client = (event.clientX !== undefined) && [event.clientX, event.clientY]
	|| (event.touches && event.touches[0] && event.touches[0].clientX !== undefined) && [event.touches[0].clientX, event.touches[0].clientY]
	|| hh.state.client 
	|| [0,0];
	
	// on safari, state.page is always from [0,0] to the size of the viewport in CSS pixels. page includes scrolling, 0 is the top of the page
	/*state.page = (event.pageX !== undefined) && [event.pageX, event.pageY]
	|| (event.touches && event.touches[0] && event.touches[0].pageX !== undefined) && [event.touches[0].pageX, event.touches[0].pageY]
	|| hh.state.page 
	|| [0,0];*/
	
	// during a scroll event, event.pageX isn't going to be updated on safari. so 
	var event_page = (event.pageX !== undefined) && [event.pageX, event.pageY]
		|| (event.touches && event.touches[0] && event.touches[0].pageX !== undefined) && [event.touches[0].pageX, event.touches[0].pageY];
		
	if (event_page)
		hh.page_without_scroll = [event_page[0] - window.scrollX, event_page[1] - window.scrollY];
	
	if (hh.page_without_scroll)
	{
		state.page = [hh.page_without_scroll[0] + window.scrollX , hh.page_without_scroll[1] + window.scrollY];
		state.content = [state.page[0] - catd.offsetLeft, state.page[1] - catd.offsetTop];
	}
	
	// state.content is the CSS pixel into the content area including any scrolling and zooming.
	//state.content = [state.client[0] - catd.offsetLeft + window.scrollX, state.client[1] - catd.offsetTop + window.scrollY];
	
	// state.fixed is the mouse location in physical pixels
	var scale = window.visualViewport ? window.visualViewport.scale : 1;
	state.fixed = [state.client[0] * scale, state.client[1] * scale];

	hh.state = state;
	// content seems to be the one that works the same from browser to browser
	//put(state.content);

	hh.event = event;
	hh.target = (event.srcElement || event.target);
	
	hh.viewport = {};
    ['offsetLeft','offsetTop','pageLeft','pageTop','height','width','scale'].forEach((p)=>hh.viewport[p]=(window.visualViewport||{scale:1})[p] || 0);
	
	hh_store_state('scroll', [window.scrollX,window.scrollY]);
	document.body.classList.remove('context_menu');

	put([window.scrollY,hh.viewport.offsetTop,hh.viewport.pageTop,hh.viewport.height],event.type);
	put(hh.state.content);
}

function hh_url_properties(new_href, accept_as_current)
{
	var base_a = document.createElement('a'); base_a.href = '.';
	var new_a = document.createElement('a'); new_a.href = new_href;
	var href = new_a.href.substr(base_a.href.length);	// we should have a better nickname for the short url than 'href'
	var match = /^user\/([^/.]+)\/([^.]*)$/.exec(href);

	var url = { full: new_a.href, base: base_a.href, href: decodeURI(href), user: decodeURI(match ? match[1] : ''), path: decodeURI(match ? match[2] : href) };
	if (accept_as_current)
		hh.url = url;
	return url;
}

function hh_selection_properties(anyTool)
{
	if (!hh.wgsr_hold)
	{
		hh.wgsdae = document.activeElement;
		hh.wgsr = window.getSelection().rangeCount && window.getSelection().getRangeAt(0);
		
		// we should select any selected gutter items here for editing simplicitiy
	}

	var enable_undo_button = hh.state.shift 
		? (hh.undoables_count != hh.undoables.length) || document.queryCommandEnabled('redo', false, false)
		: hh.undoables_count || document.queryCommandEnabled('undo', false, false);
	document.querySelector('#dec_undoredo').disabled = !enable_undo_button;
	document.querySelector('#undo_symbol').setAttribute('data-after-content', (hh.state.shift&&enable_undo_button) ? '\u21bb' : '\u21ba');
	document.querySelector('#undo_symbol > img').style.transform = (hh.state.shift&&enable_undo_button) ? "scaleX(-1)" : "scaleX(1)";

	(['bold','italic','underline','strikethrough','fontsize','createLink','delete','removeFormat','insertimage','foreColor']).map((c)=>{
		Array.prototype.map.call(document.querySelectorAll('#dec_'+c),(e)=>{
			//if (document.queryCommandEnabled(c)) e.removeAttribute('disabled'); else e.setAttribute('disabled', 'disabled');
			e.classList.toggle('disabled', document.activeElement===cai && !document.queryCommandEnabled(c));
			e.classList.toggle('hilite', document.queryCommandState(c));
			if (c=='fontsize') 
			{
				e.setAttribute('data-after-content', document.queryCommandValue('fontsize') || '#');
			}
			if (c=='foreColor' && hh.target !== e) 
			{
				var fc = (hh.tool=='paint'&&css_evaluate(hh.color)) || document.queryCommandValue('foreColor');
				e.value = fc && rgb2hex(fc) || null;
			}
		});
	});
	
	function rgb2hex(rgb) {
		if (/^#[0-9A-F]{6}$/i.test(rgb)) return rgb;
		//put(rgb);
		var rgbm = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
		if (rgbm)
			return "#" + hex(rgbm[1]) + hex(rgbm[2]) + hex(rgbm[3]);
		return getHexColor(rgb);
		function hex(x) {
			return ("0" + parseInt(x).toString(16)).slice(-2);
		}
		function getHexColor(colorStr) {
			var a = document.createElement('div');
			a.style.color = colorStr;
			var colors = window.getComputedStyle( document.body.appendChild(a) ).color.match(/\d+/g).map(function(a){ return parseInt(a,10); });
			document.body.removeChild(a);
			return (colors.length >= 3) ? '#' + (((1 << 24) + (colors[0] << 16) + (colors[1] << 8) + colors[2]).toString(16).substr(1)) : false;
		}
	}
	
	if (hh.tool != 'paint')
	{
		var fc = document.queryCommandValue('foreColor');
		set_color((fc && rgb2hex(fc)) || null);
	}
	
/*	Array.prototype.map.call(document.querySelectorAll('#dec_back'),(e)=>{
		e.classList.toggle('disabled', !(document.referrer && hh_url_properties(document.referrer).base == hh.url.base));
	});*/
	
	Array.prototype.map.call(document.querySelectorAll('#dec_superscriptsubscript'),(e)=>{
		var sub = document.queryCommandState('subscript'), sup = document.queryCommandState('superscript');
		e.classList.toggle('hilite', sub || sup);
		e.classList.toggle('disabled', document.activeElement===cai && !document.queryCommandEnabled('superscript'));
		//e.disabled = !document.queryCommandEnabled('superscript');
		e.setAttribute('data-after-content', "\uD835\uDC65" +(sub ? '\u2082' : '\u00B2'));
	});
	
	if (anyTool || (document.activeElement === cai && hh.tool == 'type'))
	{
		var sel = content_virtual_dom.GetSel()
		hh_store_state('sel', sel);
	}
	
}

// 'state' is so generic needs a better name for transient small data
function hh_get_state(key,href)
{
	return hh.files[href || hh.url.href || '.'].state[key];
}
function hh_store_state(key, value, href)
{
	href = href || hh.url.href || '.';
	var entry = hh.files[href];
	if (entry)
	{
		if (JSON.stringify(entry.state[key]) != JSON.stringify(value))	// state is meant for small data
		{
			entry.state[key] = value;
			hh_queue_autostore();
			//console.log(hh.tool,key,value);
		}
	}
}

function hh_queue_autostore()	
{
	clearTimeout(hh.autostore);
	hh.autostore = setTimeout(hh_store_locally, hh.connected ? 1000 : 100);	// debounce 1000ms  
}
function hh_store_locally(force_changes)	
{
	if (!localStorage.getItem('allow_cookies'))
		return;
		
	// state is cheap to save, we just do it when autostore is queued
	var files_state = {};
	Object.keys(hh.files).forEach((f) => { if (hh.files[f].state) files_state[f] = hh.files[f].state; });
	localStorage.setItem('files_state', JSON.stringify(files_state));
	
	var changed_files = Object.keys(hh.files).filter((f)=>!!(hh.files[f].changes && hh.files[f].changes.dirty));
	if (force_changes || changed_files.some((f)=>!!hh.files[f].changes.unstored))
	{
		var files_changes = {};
		changed_files.forEach((f)=>{ files_changes[f] = hh.files[f].changes; });
		try {
			var names = Object.keys(files_changes);
			put('Storing ' + names.length + ' file' + (names.length==1?'':'s') /*+ ':'+ names.join()*/); 
			localStorage.setItem('files_changes', JSON.stringify(files_changes));
			changed_files.forEach((f)=>{ delete hh.files[f].changes.unstored; });
		}
		catch (e) { 
			put('Problem storing ' + Object.keys(files_changes).join() + ': ' +e); 
			}
	}
	
	// changes might take longer and they're semi precious so there's an 'unstored' flag
	/*var files_changes = {}, any_unstored = false;
	Object.keys(hh.files).forEach((f) => { 
		if (hh.files[f].changes) {
			any_unstored = any_unstored || hh.files[f].changes.unstored; 
			delete hh.files[f].changes.unstored;
			files_changes[f] = hh.files[f].changes;
		}
	});
	if (any_unstored || force_changes) {
		//console.log('storing content change');
		// gutter selection should really be in state, not content  
		localStorage.setItem('files_changes', JSON.stringify(files_changes));
	}*/
	
	clearTimeout(hh.autostore);
}

function hh_upload(single_file)
{
	// ah this is hard to concentrate. gotta retrofit for name changes. maybe replace '$' with 'new/', no don't break folders
	// 
	
	var uploads = single_file ? [single_file] : Object.keys(hh.files).filter((f)=>{
		return (f!='.') && hh.files[f].changes 
			&& hh.files[f].changes.dirty 
			&& (f[0]=='$' || user_of_file_path(f)==hh.username);
	});
	if (!uploads.length) return;
	
	var names = [];
	uploads.forEach((f)=>{
		var proposal = (hh.files[f].changes && hh.files[f].changes.href) || f;
		if (f[0] == '$') 
		{
			var  pn = 2, pb =  
				(hh.files[f].changes.href || (hh.username ? 'user/'+hh.username+'/' : '')+hh.files[f].changes.blurb);
			proposal = pb;
			while (hh.files[proposal] || names.indexOf(proposal)!=-1) 
				proposal = pb + ' ' + pn++;
		}
		names.push(proposal);
	});

	if (navigator.onLine === false)
		return alert('The internet connection appears to be offline.');
	if (!confirm("Upload the following files?\n" + names.map((n)=>/*'• '+*/n).join(',\n')))
		return;

	var fetches = 0, results = [], had_problem = false;
	uploads.forEach((f,index)=>{

		// we're uploading $123 for the current user. this is annoying code and causes weird problems. might need to redo it all
		// ok problems saving a note as user/private/Name With Spaces:
		// 	the menu doesn't update to new state until reload. (fix with replaceState) Once you reload:
		//	the original note is still there but with only ellipsis
		//	the new file is in /private, but when you click on it, it spawns a Name%20With%20Spaces to go to instead (this bug seems to occur in isolation)
		
		// above seem fixed. Great work! For the below, I think a plain click in an already active data-filename should select text for editing, and also show a small trashcan. And download your files as HTML would be in the account box, an option in ListFiles running an adaptation of generate_node_from_faux.
		// we also need a 'delete' which could just be uploading empty, that would be fine
		// and we need a 'rename', since we're doing one anyway.
		// and....we need a 'download your files as HTML' in the account menu
		// lastly, a little nicer UI when pages load would be good. Plus maybe put() pulsing opacity to 1.0 momentarily
		// and when you log out, leave a user page!
		var new_name = names[index];	//(f[0]=='$' && hh.username) ? 'user/'+hh.username+'/'+(hh.files[f].changes.blurb||f) : f;
		var match = /^user\/([^/.]+)\/([^.]*)$/.exec(new_name);
		
		// this is annoying... f is the server href, or just $123456. new_name is the same normally, or the new href 
		
		put("Uploading /" + new_name);
		var formdata = new FormData();
		var formfile = {
				version: 1,
				content: hh.files[f].changes && hh.files[f].changes.content || hh.files[f].file.content || {},
				gutter: hh.files[f].changes && hh.files[f].changes.gutter || hh.files[f].file.gutter || {}
			};
		formdata.append('user', match ? match[1] : '');
		formdata.append('path', match ? match[2] : new_name);
		if (f[0] != '$' && f != new_name)
		{
			// are we changing
			var match = /^user\/([^/.]+)\/([^.]*)$/.exec(f);
			formdata.append('oldpath', match[2]);
			//alert('changing name ' + new_name + ' oldpath ' + match[2]);
		}
		formdata.append('json', JSON.stringify(formfile));
		console.log(formfile);
		
		fetches++;
		fetch('Save.File/', { method:'POST', body: formdata }).then(response=>{
			if (!response.ok) response.text().then((t)=>{ results.push(new_name+': '+t); had_problem = true; fetchdone(true); });
			else 
			{
				results.push(new_name+': '+'Success');
				hh.files[f].file = formfile;
				delete hh.files[f].changes;
				
				if (f != new_name)
				{
					// ok, but what if new_name is the same as another old name? Gotta fix
					hh.files[new_name] = hh.files[f];
					delete hh.files[f];
					if (hh.url.href == f)
					{
						history.replaceState(null,null,new_name);
						hh_url_properties(location.href, true);
					}
					hh_list_files_in_menu();
				}
				
				hh_check_files_in_menu();
				hh_store_locally(true);
				fetchdone();
			}
		});
	});
	
	function fetchdone()
	{
		fetches--;
		if (!fetches)
		{
			put("Done uploading " + uploads.join(', '));
			if (results.length && had_problem) alert(results.join('\n'));
		}
		// we need to GO to a new name, replace state, if the current page is a note too
		// this is easy, if we renamed the current page just use history.replaceState('', '', 'newName');

	}
			
}

function ensure_in_array(array,value)
{
	if (array.indexOf(value) == -1)
		array.push(value);
}
function hh_list_files_in_menu()
{
	//console.log('listing files');
	
	var files = Object.keys(hh.files).filter((f)=>(f != '.'));

	var bfl = document.getElementById('burger_filelist');
	bfl.innerHTML = "";
	
	files.forEach((f)=>{
		var match = /^user\/([^/.]+)\/([^.]*)$/.exec(f);
		var user = (match ? match[1] : '');
		// make sure the user appears for a file. 
		if (user)
			ensure_in_array(files, 'user/'+user+'/');
		// make sure all the lower folders appear for a file too. However this should support renamed-but-not-saved too...
		// next check rename logic to see if it supports folders properly
		var path_elements = f.split('/');	// [user,name,folder,subfolder,subfile] or [folder,subfolder,subfile]
		while (path_elements.length > 1)
		{
			path_elements.pop();
			var output = path_elements.join('/')+'/';
			if (output != 'user/')
				ensure_in_array(files, output);
		}
	});

	/*if (hh.username)	// display note files in your own user? no, don't do that
		files = files.map((f)=>{ return (f[0]=='$') ? 'user/'+hh.username+'/'+f : f });*/
	
	//files.sort((a,b)=>(((user_of_file_path(a)==hh.username && user_of_file_path(b)!=hh.username) || (a<b))?-1:1))
	files.sort((a,b)=>{
		var auser = user_of_file_path(a), buser = user_of_file_path(b);
		if (auser && buser) {
		if (hh.username && auser == hh.username) auser = '';	// make hh.username first in this list
		if (hh.username && buser == hh.username) buser = '';
		}
		return auser.localeCompare(buser) || a.localeCompare(b);
	});
	files.forEach((f)=>{
		var match = /^user\/([^/.]+)\/([^.]*)$/.exec(f);
		var user = (match ? match[1] : '');
		var file = (match ? match[2] : f);
		
		var entry = hh.files[f] || {};
		var owned = (user && user==hh.username);
		
		// could be user/Bill/, file, folder/...
		
		var path = file.split('/');
		var filename = (entry.changes && entry.changes.name) || (f[0]=='$' && entry.changes && (entry.changes.blurb || "...")) || path.pop() || (!file ? '' : path.pop()/*+'/'*/);
		var level = file.split('/').length - (file.endsWith('/')?1:0);
		
		//console.log(f,user,file);
		var node = generate_node_from_faux({
			tag: 'DIV',
			class: 'burger_menuitem ' + (!file ? ' burger_menuitem_user' : '') + (owned ? '' : ' onClickCloseBurgerMenu'),
			_: [
				(owned || f[0]=='$') ?
				{
					tag: 'IMG',	
					class: 'burger_menuitem_save darkfilter heightone onClickUploadOne',
					src: 'images.folder/uparrow.svg'
				} : {
					tag: 'SPAN',	
					class: 'burger_menuitem_save',
					_: [ "•" ]
				},
				user && file && '     '.repeat(level),
				(user || f[0]=='$') && {
					tag: 'IMG',
					class: 'darkfilter burger_menuitem_icon heightonepointtwo',
					src: (!file) ? 'images.folder/account.svg' : (f[0]=='$') ? 'images.folder/pen.svg' : file.endsWith('/') ? 'images.folder/directory.svg' : 'images.folder/file.svg'
				},	
				' ',
				{
					tag: 'A',
					class: (owned && !filename ? 'bold' : ''),
					href: f,
					_: [ filename || user ]
				}
			]
		});
		node.setAttribute('data-filename', f);
		bfl.appendChild(node);
	});

	hh_check_files_in_menu();
}

function hh_check_files_in_menu()
{
	var any_dirty=false;
	
	document.querySelectorAll('#burger_menu .burger_menuitem[data-filename]').forEach(menuitem=>{
		var href = menuitem.getAttribute('data-filename');
		var checked = (href == (hh.url.href || '.'));
		menuitem.setAttribute('data-checked', checked);
		
		// allow the name of the current item to be edited
		var Alink = menuitem.querySelector('A');
		if (Alink)
		{
			var oldText = Alink.innerText;
			var match = /^user\/([^/.]+)\/([^.]*)$/.exec(href);
			var editable = checked && (!hh.connected || href[0]=='$' || (hh.username && match && (match[1]==hh.username) && (match[2]!='')));
			Alink.contentEditable = !!editable;
			Alink.onfocus = !editable ? null : (event)=>{ 
				Alink.classList.add('rename_file');
				setTimeout(()=>{
					var range = document.createRange();
					range.selectNodeContents(Alink);
					var sel = window.getSelection();
					sel.removeAllRanges();
					sel.addRange(range);
				},1);
			};
			Alink.onblur = !editable ? null : (event)=>{ 	// do we want to require return? might make more sense
				Alink.classList.remove('rename_file');
				var newName = Alink.innerText.replaceAll(/[.]/g,'-'), newHref = href.split('/');
				newHref.splice(-1,1,'');
				newHref = newHref.join('/') + newName;
				//.slice(0,-1).join('/')+'/'+newName;	// actually want to replace
				if (newName && href != newHref && (href[0]=='$'||confirm('Rename “' + href + '” to ”' + newHref + '”?'))) 
				{ 
					Object.assign(hh.files[href].changes, {
						name:newName,
						href:newHref,
						dirty:true,
						unstored:true
						}); 
					hh_queue_autostore();	
					hh_check_files_in_menu(); 
				}	
				else Alink.innerText = oldText;	// i'd like the menu not to disappear
				Alink.blur(); 
			}; 
			Alink.onkeydown = !editable ? null : (event)=>{ 
				if (event.keyCode == 13) { Alink.blur(); event.preventDefault(); event.stopPropagation(); } 
				else if (event.keyCode == 27) { Alink.innerText = oldText; Alink.blur(); event.preventDefault(); event.stopPropagation(); }	// need to block the esc !
			}; 
		}
		
		var dirty = hh.files[href] && hh.files[href].changes && hh.files[href].changes.dirty;
		menuitem.setAttribute('data-dirty', !!dirty);

		var match = /^user\/([^/.]+)\/([^.]*)$/.exec(href);
		var user = (match ? match[1] : '');

		any_dirty = any_dirty || (dirty && (href != '.') && (user && (user==hh.username) || href[0]=='$'));
	});
	document.body.classList.toggle('hh_dirty', !!any_dirty);
}

function hh_short_name_from_text(text)
{
	text = text.trim();
	var match = text.match(/[\n\r.?#]/);
	return text.trim().substring(0, Math.min(30, match ? match.index : text.length) );
}

function user_of_file_path(href)
{
	var match = /^user\/([^/.]+)\/([^.]*)$/.exec(href);
	return match ? match[1] : '';
}

function getCookie(cname) {
	var name = cname + "=";
	var decodedCookie = decodeURIComponent(document.cookie);
	var ca = decodedCookie.split(';');
	for(var i = 0; i <ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return "";
}

function list_files_from_server(all_files)
{
	var fetches = [''];
	if (hh.username)
		fetches.push(hh.username);

	fetches.forEach((which)=>
		fetch('List.Files/'+which).then(response=>response.json()).then(data=>{
			// we're going to accept '.' from the server
			var file_list = {};
			Object.keys(data).forEach((f) => { file_list[f] = data[f]; });
			hh.file_lists_downloaded.push(which);
			receive_files(file_list);
		}));
}

function receive_files(file_list)
{
	Object.keys(file_list).forEach((f)=>{ 
		Object.assign(hh.files[f]=(hh.files[f]||{}), file_list[f]); 
		hh.files[f].error = file_list[f].error;
		hh.files[f].state = hh.files[f].state || {};
		hh.files[f].changes = hh.files[f].changes || {};
		});
	hh_list_files_in_menu();
}

// dammit, the whole stack needs to be gone through to handle those stupid percent signs. an honorable slog.
// let's replace $123456 with new/123456 too for nicer URLing. Same deal, looks more sensible to the user.
function hh_go_to_page(new_href, by_state_handler)
{
	var new_url = hh_url_properties(new_href || '.');
	if (!new_url.full.startsWith(hh.url.base))	// not our site
		return false;	
	if (new_url.href.indexOf('.')!=-1)	// periods not permitted in shell
		return false;
		
	if (new_href.match(/^user(\/[^./]+)?$/))
	{
		console.log('fixing non-preferred user URL form');
		return hh_go_to_page(new_href+'/');
	}

	var new_href = (new_url.href || '.');
	console.log((by_state_handler ? 'arriving at page ' : 'going to page '), new_href);
		
	if (hh.files[new_href] && (hh.files[new_href].file || new_href[0]=='$'))
	{
		show_page();
	}
	else if (hh.connected)
	{
		fetch('Load.File/'+new_href).then(function(response) {
			var oops = response.status + ' ' + response.statusText + ((navigator.onLine === false) ? '\nThe internet connection appears to be offline.' : '');
			return (!response.ok) ? new Response(JSON.stringify({ error: oops })) : response;
		}).then(response=>response.json()).then(json=>{
			//contentareaheader.innerText += 'load: ' + JSON.stringify(json) + '\n';
			var packet = {};
			packet[new_href] = {file:json};	// { [new_href]: json } is ES6
			receive_files(packet);
			show_page();
		}).catch(error=> {
			alert('Error loading ' + name + ': ' + error + ((navigator.onLine === false) ? '\nThe internet connection appears to be offline.' : ''));
			if (by_state_handler)
			{
				// this doesn't quite work, goes to wrong place etc
				var packet = {};
				packet[new_href] = { error:error, state: {}, changes: {} };
				receive_files(packet);
				show_page();
			}
		});
	}
	else
	{
		console.log('not connected, cannot open ' + new_href);
	}
	return true;
	
	function show_page()
	{
//		console.log('showing page ' + new_href);

		var entry = hh.files[new_href];
		entry.file = entry.file || {};
		entry.changes = entry.changes || {};
		entry.state = entry.state || {};
	
		var old_url = hh.url;
		hh_url_properties(new_href, true);
		
		document.title = (hh.testbed ? hh.testbed+' ' : '') + ((!hh.url.path ? hh.url.user : entry.changes.blurb || entry.file.name) || hh.document_title);
		
		if (hh.connected && !by_state_handler && old_url.full != hh.url.full)
		{
			// don't have burger menu visible when back button applied, so the menu doesnt appear for back swipe.  Note, this doesn't seem to work on safari. When is state actually saved? This is just graphical.
			//var burger_visible = document.querySelector('#burger').classList.contains('display');
			//document.querySelector('#burger').classList.remove('display');
			history.pushState(null, null, hh.url.full);
			//document.querySelector('#burger').classList.toggle('display', burger_visible);
		}
		
		hh_check_files_in_menu();
		
		// don't animate for the back button, reload, etc. it looks wrong, except maybe for the back button, but not for the back swipe gesture, so eh
		if (!by_state_handler && old_url.full != hh.url.full) {
			//ca.style.transformOrigin = 'center';
			// having transition, transform, opacity changes its zindex to be behind everything else
			catd.style.background = "var(--toolbar-color);";
			ca.style.transition = 'transform 0.2s, opacity 0.25s'; 
			ca.style.transform = 'translate(-100%,0%)';	
			ca.style.opacity = '0';	
			setTimeout(()=>{
				ca.style.transition = 'transform 0s, opacity 0s';
				ca.style.transform='translate(10px,0%)';	
				ca.style.opacity='0.0';	
				switch_in();
				ca.style.transition = 'transform 0.25s, opacity 0.25s'; 
				ca.style.transform='initial';
				ca.style.opacity='initial';	
				catd.style.background = "initial";
			}, 200);
		}
		else switch_in();
		
		function switch_in()
		{
			content_virtual_dom.disconnect();
			gutter_virtual_dom.disconnect();

			try
			{
				// any way to swap both in simultaneously to fix the jump?
				gutter_virtual_dom.faux = entry.changes.gutter || entry.file.gutter || { _:[  ] };
				gutter_virtual_dom.CopyFauxToNode({ left: [0], right: [0] });
				
				content_virtual_dom.faux = entry.changes.content || entry.file.content || { _:[ { tag: "BR" } ] };
				content_virtual_dom.CopyFauxToNode({ left: [0], right: [0] });

				setTimeout(clean_up_float_order, 1);
				
				//console.log(window.getSelection());
				if (entry.file.error)
					put('('+entry.file.error+')' + ' ' + new_href);
				else if (!by_state_handler)
				 	put('Loaded');

				//console.log(entry.state.sel);
				content_virtual_dom.SetSel(entry.state.sel || { anchor: [], focus: [] });
			}
			catch (e) { console.log(e); }

			content_virtual_dom.connect();
			gutter_virtual_dom.connect();
			
			window.scrollTo((entry.state.scroll || [0,0])[0], (entry.state.scroll || [0,0])[1]);
			
			if (!by_state_handler) {
			}
			
			hh_set_tool(hh.tool);
			if (hh.tool == 'paint')
			{
				// good to remind people that they're in paint mode
				document.body.classList.add('hh_canvas_swatch_active');
				setTimeout(()=>document.body.classList.remove('hh_canvas_swatch_active'), 600);
			}
	 	}
	}
}


function hh_undo_counter_input()
{
	if (hh.wgsr_hold)
		return;
		
	window.getSelection().removeAllRanges();
	if (hh.wgsr) 
		window.getSelection().addRange(hh.wgsr);
	// undo counter cannot receive keystrokes and must not have focus
	if (document.querySelector('#hh_undo_counter') === document.activeElement)
		document.querySelector('#hh_undo_counter').blur();	
	
	var new_secret = parseInt(document.querySelector('#hh_undo_counter').innerText);
	if (new_secret == hh.undoables_count-1)
		hh.undoables[new_secret].undo();
	else if (new_secret == hh.undoables_count+1)
		hh.undoables[new_secret-1].redo();
	else // i'm not sure how this could actually happen. it's possible that two undo or two redo events could occur before the events are processed I guess...maybe an increment loop for this
		console.log(['undo got out of sync', new_secret, hh.undoables_count]);
	hh.undoables_count = new_secret;
}

function hh_undo_register(undo,redo)
{
	hh.undoables.splice(hh.undoables_count, hh.undoables.length, { undo, redo });
	hh.undoables_count++;

	hh.wgsr_hold = true;
	var wgs = window.getSelection(), wgsr = wgs.rangeCount && wgs.getRangeAt(0), wgsdae = document.activeElement, snc = document.createRange();
	wgs.removeAllRanges();
	snc.selectNodeContents(document.querySelector('#hh_undo_counter'));
	wgs.addRange(snc);
	document.execCommand('insertText', false, new String(hh.undoables_count));
	wgs.removeAllRanges();
	if (wgsr) 
		wgs.addRange(wgsr);
	if (wgsdae)
		wgsdae.focus();
		
	// undo counter cannot receive keystrokes and must not have focus
	if (document.querySelector('#hh_undo_counter') === document.activeElement)
		document.querySelector('#hh_undo_counter').blur();	
	hh.wgsr_hold = false;

	hh_selection_properties();
}

function hh_set_tool(tool) 
{ 
	//alert(['setting tool',hh.pen,hh.tool,hh.tool_set_by_pen]);	// this shows when the tool was LAST set by pen
	hh.tool_set_by_pen = (hh.pointerType=='pen');
	hh.tool = tool = (tool||'user');
	document.body.setAttribute('data-hh-tool', tool); 

	//mo.disconnect();	// TESTING
	
	// let's try a new idea for paint: leave the contenteditable alone for it
	//if (hh.tool=='user' || hh.tool=='type')
	cai.classList.toggle('selectionshield', (tool=='paint'));
	{
		var editable = (tool=='type' /*|| tool=='paint'*/);		// now that paint's integrated with undo, its crazy not to keep the keyboard available
		cai.setAttribute('contenteditable', editable);
		cai.setAttribute('spellcheck', tool=='type');

		var gutter_containers = cag.querySelectorAll('.container');
		for (var i = 0; i < gutter_containers.length; i++)
		{
			// the top level gutter works fine but the selection needs control
			gutter_containers[i].setAttribute('contenteditable', editable);
			gutter_containers[i].setAttribute('spellcheck', editable);
		}
	}
	
	var gutter_containers = cag.querySelectorAll('.field');
	for (var i = 0; i < gutter_containers.length; i++)
	{
		// the top level gutter works fine but the selection needs control
		gutter_containers[i].setAttribute('contenteditable', true);
		//gutter_containers[i].setAttribute('spellcheck', editable || gutter_containers[i].classList.contains('field'));
	}

	//mo.connect();	// TESTING
	
	// roughly sense if we're using a real computer, and if so, establish focus. don't want to do this on phone because the KB comes up
	/*var is_real_computer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	if (tool=='type' &&  is_real_computer)
		cai.focus();	
	else if (tool!='type' && !is_real_computer)
		cai.blur();*/
	//put(event,hh.tool, hh.tool_set_by_pen && 'pen');
	
	// ok, question here, how to we mutate something without alerting the watcher?
	
	var gutters = document.querySelectorAll('#contentarea input, #contentarea button');
	for (var i = 0; i < gutters.length; i++)
	{
		// this is trouble. in safari clicks on disabled controls are filtered and ignored, breaking event handling. we need a fixit! 
	/*	if (tool == 'user')
			gutters[i].removeAttribute('disabled');
		else
			gutters[i].setAttribute('disabled', true);*/
	}
	
	// now trigger a end to current hover activity, the cursor will need to move to trigger another
	if (is_mouse_in_catd)
	{
		set_mouse_in_catd(false);
		set_mouse_in_catd(true);
	}

	hh_store_state('tool', tool, '.');
	hh_selection_properties();
}


var it = "";
function get (p)
{
	it = p;
}
function put ()
{
	document.querySelector('#version').innerText = Array.prototype.slice.call(arguments).join('\n');
	//console.log('put ' + Array.prototype.slice.call(arguments).join(', '));
}

function rect_intersects_rect(A,B) { return (A[0] < B[2] && A[2] > B[0] && A[1] < B[3] && A[3] > B[1]); }
function pt_inside_rect(A,B) { return (A[0] >= B[0] && A[0] <= B[2] && A[1] >= B[1] && A[1] <= B[3]); }
function rect_inside_rect(A,B) { return (A[0] >= B[0] && A[2] <= B[2] && A[1] >= B[1] && A[3] <= B[3]); }
function clientRect(el) { var bcr = el.getBoundingClientRect(); return [bcr.x,bcr.y,bcr.right,bcr.bottom]; }


// different things need different colors; eg canvas can't use var(--text-color) expressions, but we should never *store* the result of it...hmm
function css_evaluate(varOrValue, altValue)
{
	return (varOrValue[0]=='-' ? String(getComputedStyle(document.documentElement).getPropertyValue(varOrValue) || altValue) : varOrValue).trim();
}

function set_color(c)
{
	hh.color = c || '--text-color';
	if (hh.color != '--text-color')
		document.documentElement.style.setProperty('--current-color', hh.color[0]=='-' ? 'var('+hh.color+')' : hh.color);
	else
		document.documentElement.style.removeProperty('--current-color');
	hh_store_state('color', hh.color, '.');
}
function to_css_color(colorOrVar)
{
	return (colorOrVar[0]=='-' ? String(getComputedStyle(document.documentElement).getPropertyValue(colorOrVar)) : colorOrVar).trim();
}

function gutter_float_shape_outside(element)
{
	if (element.nodeName.toLowerCase()=='svg')
	{
		// the paths are automatically closed too, which isn't what we want, we need them to close on the far right.
		element.style.shapeOutside = '';
		var oldwidth = element.getAttribute('width');
		element.removeAttributeNS(null,'width');
		//element.setAttributeNS(null,'height', '');
		//var par = element.getAttribute('preserveAspectRatio');
		//element.setAttributeNS(null,'preserveAspectRatio', 'xMaxYMin meet');
		var xml = new XMLSerializer().serializeToString(element); //console.log(xml);
		element.style.shapeOutside = "url('data:image/svg+xml;base64,"+btoa(xml).replace(/(\r\n|\n|\r)/gm, "") + "')";
		if (oldwidth) element.setAttributeNS(null,'width', oldwidth);
		//element.setAttributeNS(null,'preserveAspectRatio', par);
	}
	else if (element.matches("label[data-image]"))
	{
		//element.style.shapeOutside = "url('" + element.getAttribute('data-image').replace(/[\n\r']/g,"") + "')";
		var img = element.querySelector('img');
		if (img)
			element.style.shapeOutside = "url('" + img.src + "')";
	}
}

function screen_point_to_svg(svg, pt, g)
{
	var s = svg.createSVGPoint();
	s.x = pt[0];
	s.y = pt[1];
	var ctm = svg.getScreenCTM();
	if (hh.desktop_safari) { var vvs = window.visualViewport ? window.visualViewport.scale : 1; ctm.e /= vvs; ctm.f /= vvs; }
	s = s.matrixTransform(ctm.inverse());
	//s.x -= (window.pageXOffset || 0);	// ought to grab this and vvs at event time
	//s.y -= (window.pageYOffset || 0);
	if (g) { s = s.matrixTransform(g.getCTM().inverse()); }
	return [s.x,s.y];
}

function hit_test_svg_path(svg_path, client_rect)
{
	var htCanvas = document.createElement('canvas'), htCtx = htCanvas.getContext('2d'), htTestSize = 5;	
	htCanvas.style.width = htCanvas.style.height = '30px';
	htCanvas.width = htTestSize; htCanvas.height = htTestSize; 
	htCtx.strokeStyle = '#000'; htCtx.lineWidth = 1; htCtx.fillStyle = '#000';
	htCtx.setTransform(1,0,0,1,0,0);
	htCtx.clearRect(0,0,htTestSize,htTestSize); 
	var gSCTM = svg_path.getScreenCTM();
	if (hh.desktop_safari) { var vvs = window.visualViewport ? window.visualViewport.scale : 1; gSCTM.e /= vvs; gSCTM.f /= vvs; }
	var s = [htTestSize/(client_rect[2]-client_rect[0]), htTestSize/(client_rect[3]-client_rect[1])];
	htCtx.setTransform(gSCTM.a, gSCTM.b, gSCTM.c, gSCTM.d, gSCTM.e, gSCTM.f);	// draw the path in client coordinates...
	htCtx.translate(-client_rect[0], -client_rect[1]);	// move everything to the drag box... 
	var ct = htCtx.getTransform();
	htCtx.setTransform(ct.a*s[0],ct.b*s[1],ct.c*s[0],ct.d*s[1],ct.e*s[0],ct.f*s[1]);
		
	var d = svg_path.getAttribute('d');
	var ptreg = /([-]?[\d]+([.][\d]+)?)[ ]*[,][ ]*([-]?[\d]+([.][\d]+)?)*/g, ptmatch, ptnew = "", ptindex = 0;
	while (ptmatch=ptreg.exec(d)) {
		var x = parseFloat(ptmatch[1]), y = parseFloat(ptmatch[3]);
		ptnew += d.substring(ptindex, ptmatch.index) + (x*ct.a+ct.e)*s[0] + ',' + (y*ct.d+ct.f)*s[1];
		ptindex = ptreg.lastIndex;
	}
	ptnew += d.substring(ptindex);
	htCtx.setTransform(1,0,0,1,0,0);
	var p = new Path2D(ptnew);
	htCtx.stroke(p);	// clear and draw
	var id = htCtx.getImageData(0,0,htTestSize,htTestSize);
	
	for (var d = id.data.length-1; d > 0; d = d-4)
		{ if (id.data[d]>50) return true; }
	return false;
}


var beep_audio;
function beep() {
	beep_audio = beep_audio || new Audio("data:audio/wav;base64,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 /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=");
	beep_audio.load();
  	beep_audio.play();
	//if (navigator.vibrate) navigator.vibrate(200);	// I hate this
}


function sound(frequency,type){
	var o=hh.AudioContext.createOscillator()
	var g=hh.AudioContext.createGain()
	o.type=type;
	o.connect(g);
	o.frequency.value=frequency;
	g.connect(hh.AudioContext.destination);
	o.start(0);
	g.gain.exponentialRampToValueAtTime(0.00001,hh.AudioContext.currentTime+1);
}
	
function eleft(e) { return e.getBoundingClientRect().left - contentareagutter.getBoundingClientRect().left; }
function etop(e) { return e.getBoundingClientRect().top - contentareagutter.getBoundingClientRect().top; }
function eheight(e) { return e.getBoundingClientRect().height; }
function ewidth(e) { return e.getBoundingClientRect().width; }

function clean_up_float_order()
{
	// the floats need to be ordered by their desired top. add each float on the side that is currently shorter
	var lefts = contentarea.querySelectorAll('#contentareagutter > .gutter.left'), leftIndex = 0;
	var rights = contentarea.querySelectorAll('#contentareagutter > .gutter.right'), rightIndex = 0;
	var leftY = 0, rightY = 0, new_order = [];
	
	// add one on the shorter side
	while (true)
		{					
			if (rightIndex < rights.length && (rightY <= leftY || leftIndex == lefts.length))
				{
					var element = rights[rightIndex]; 
					rightIndex++;
					new_order.push(element);
					rightY += eheight(element);
				}
			else if (leftIndex < lefts.length && (leftY <= rightY || rightIndex == rights.length))
				{
					var element = lefts[leftIndex]; 
					leftIndex++;
					new_order.push(element);
					leftY += eheight(element);
				}
			else break;
		}
	
	//debugger;
	var old_order = contentarea.querySelectorAll('#contentareagutter > .gutter.left, #contentareagutter > .gutter.right');
	var leftsame = 0, rightsame = 0;
	while (leftsame < old_order.length && old_order[leftsame]===new_order[leftsame])
		leftsame++;
	
	if (leftsame < old_order.length)
		{
			// therefore old_order[leftsame] !== new_order[leftsame]
			while (rightsame < old_order.length-leftsame 
				&& old_order[old_order.length-1-rightsame]===new_order[new_order.length-1-rightsame])
				rightsame++;
			// therefore old_order[length-1-rightsame] !== new_order[length-1-rightsame]
			
			//	console.log(old_order,new_order);
			console.log(leftsame,rightsame,new_order.length-leftsame-rightsame);
			
			var fragment = document.createDocumentFragment();
			for (var i = leftsame; i < new_order.length-rightsame; i++)
				fragment.appendChild(new_order[i]);
			if (rightsame)
				contentareagutter.insertBefore(fragment,old_order[old_order.length-rightsame]);
			else contentareagutter.appendChild(fragment);
		}
	
	// this is really slow, better move only the ones you need to
	/*var fragment = document.createDocumentFragment();
	new_order.forEach((e)=>fragment.appendChild(e));
	floatspace.appendChild(fragment);*/
	// also need to keep window from scrolling up while lowest is changed
	// also need to change side of element when dragged to other side
	// investigate using calculated vh/vw to keep floaters feeling independent
	// adjust the lower spacer
}
	