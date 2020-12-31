/*<!-- (c) 2020 by Hypervariety Custom Programming. All rights reserved. !-->*/
"use strict";

/* VirtualDOM maintains a tree of text nodes and selectors, can publish one-to-one to true DOM, and watches both sides for changes */
/* it doesn't copy IDs, it doesn't remember css styles, it doesn't create script/style/iframe tags, you can't make input[type=password], etc */


function VirtualDOM(node, faux, whitelist)
{
	this.node = node || document.createElement('div');
	this.faux = faux || { _: [] };	// the root faux does not care about a selector
	this.whitelist = whitelist || { };	// such as { div: [ 'data-checked' ] }
	this.mo = new MutationObserver((m) => { this.mutationListener(m); });
	this.connected = false;
}
VirtualDOM.prototype.connect = function()
{
	this.connected = true;
	this.mo.observe(this.node, { attributes: true, childList: true, subtree: true, characterData: true });
}
VirtualDOM.prototype.catchUp = function()
{
	this.mutationListener(this.mo.takeRecords());
}
VirtualDOM.prototype.disconnect = function()
{
	this.catchUp();
	this.connected = false;
	this.mo.disconnect();
}
VirtualDOM.prototype.mark = function(element)
{
	this.catchUp();
	this.mutationListener([ { type: 'attributes', target: element, attributeName: 'attribute' } ]);
}
VirtualDOM.prototype.BeginUndoableMutations = function()	// this isn't quite enough as things can change content OR gutter
{
	this.catchUp();
		
	this.undoable_watch = true;
	this.undoable_range = null;
	this.undoable_original = deepcopy(this.faux);	// a copy on write faux might be worthwhile
}
function deepcopy(f)
{
	if (typeof f == 'object') 
	{
		f = Object.assign({},f);
		if (f._) 
			f._ = f._.map(deepcopy);
	}
	return f;
}

VirtualDOM.prototype.FinishUndoableMutations = function(generateUndoable)
{
	this.catchUp();
	this.undoable_watch = false;
	
	/* All right let's think. Problem #1: bad input. Missing _:[] can crash the functions. Problem #2: label[data-image | data-youtube] method adds an element, which UnchangedEdges notices during undo, and then is disappeared because it was never in the faux. Can we support 'virtual _' then? Something that fixes both problems? Maybe __:[] which would be created but not stringified.
	On the other hand, we don't use unchanged edges anywhere now that we have mutation observer which is much better. this.faux is always up to date. So we could either rewrite some of the CopyNodeToFaux to do shard modifications or something, or we could write a quickie that finds unchaged edges of the stored vs current and use that.
	But we're still comparing faux to node because anything can change stuff. UnchangedEdges() could have a fast mode that doesn't deep scan without suspicion, but...
	OK how about this. Take another look at label[data-image]. Don't save that?
	mutationobserver is ignoring width/height....that should be ok though...
	So, i guess the deal here is, we should actually start a mutation observer change range that is saved.
	*/
	
	var prev = this.undoable_original, next = this.faux, undoable_range = this.undoable_range;

	if (!undoable_range || !generateUndoable || JSON.stringify(prev) == JSON.stringify(next))
		return;
	
	next = deepcopy(next);
	var restore = (backto) => {	
		this.faux = backto; 
		this.CopyFauxToNode(undoable_range);
		if (this.ChangedCallback) this.ChangedCallback(undoable_range); 
		console.log('Performed undo',prev,next,undoable_range);
		}
		
	console.log('Undoable mutations',prev,next,undoable_range);
	hh_undo_register(()=>restore(prev), ()=>restore(next));	
}

VirtualDOM.prototype.mutationListener = function(mutationsList)
{
	var thisNode = this.node, range = null;
	
	var expand_range = (target, within)=>
	{
		if (!within && (target === thisNode))	// if node itself changed we don't care
			return;
				
		// if !!within then assume we're referring to the extremities inside node, instead of node itself
		var left = (within=='left') ? [0] : (within=='right') ? [target.childNodes.length] : [];
		var right = (within=='left') ? [target.childNodes.length] : (within=='right') ? [0] : [];
		
		while (target !== thisNode)	
		{
			if (!target.parentNode)	// safari sometimes passes orphans
			{
				return;	
			}
			var index = Array.prototype.indexOf.call(target.parentNode.childNodes, target);
			left.unshift(index);
			right.unshift(target.parentNode.childNodes.length - index - 1);
			target = target.parentNode;
		}
		
		if (!range)
			range = { left, right };
		else
			widen_range(range, left, right);
		
		if (this.undoable_watch)
		{
			if (!this.undoable_range)
				this.undoable_range = { left, right };
			else
				widen_range(this.undoable_range, left, right);
			//console.log('widened undoable range', this.undoable_range, left, right);
		}
	}
	
	function widen_range(range, left, right)
	{
		// the boundaries can get shorter or smaller, but never longer or larger.
		range.left.splice(left.length);
		for (var i = 0; i < range.left.length; i++)
			range.left[i] = Math.min(range.left[i], left[i]);
		range.right.splice(right.length);
		for (var i = 0; i < range.right.length; i++)
			range.right[i] = Math.min(range.right[i], right[i]);
	}

	var html = this.node.innerHTML;
	for (var m of mutationsList) 
	{
		if (m.type == 'childList')
		{
			var target = m.target && m.target.outerHTML, added = m.addedNodes, removed = m.removedNodes, prev = m.previousSibling && m.previousSibling.outerHTML, next = m.nextSibling && m.nextSibling.outerHTML, contained = this.node.contains(m.target);
			
			// i'm not 100% sure of this code. It seems to include things in the range that don't need to be. I think it's Safari's fault though.
			if (m.previousSibling && m.previousSibling.nextSibling)	
			{
				expand_range(m.previousSibling.nextSibling);	// call that the leftmost changed item
			}
			else
			{
				expand_range(m.target, m.previousSibling ? 'right' : 'left');
			}

			if (m.nextSibling && m.nextSibling.previousSibling)	
			{
				expand_range(m.nextSibling.previousSibling);		// call that the rightmost changed item
			}
			else
			{
				expand_range(m.target, m.nextSibling ? 'left' : 'right');	// at end
			}
		}
		else if (m.type == 'attributes' || m.type == 'characterData')
		{
			//console.log(m.type,  (m.type == 'attributes') ? m.attributeName : m.data, m.target, m.target.nodeValue);
			// what we need is to go to the attributes whitelist, but we can at least prevent tool switching and initing from triggering content change
			// next tiny step is a disconnect/connect for this observer.
			if (m.type == 'attributes' && m.target === this.node)	// don't watch the node attributes directly
				continue;
			if (m.type == 'attributes' && ['contenteditable','spellcheck','style','width','height'].indexOf(m.attributeName)!=-1)
				continue;
			expand_range(m.target);
		}
	}
	
	if (!range)
		return;
	
	//console.log('mutation accepted',range);
	

	// the mutations could include subobjects and other things that don't exist in the faux map, so we chop down the range to fit the faux map.
	var f = this.faux;
	for (var i = 0; i < range.left.length; i++)
	{
		range.left[i] = Math.min(range.left[i], (f._ || []).length);
		f = (f._ || [])[range.left[i]];
		if (!f || typeof f != 'object')
			range.left.splice(i+1);
	}
	var f = this.faux;
	for (var i = 0; i < range.right.length; i++)
	{
		range.right[i] = Math.min(range.right[i], (f._ || []).length);
		f = (f._ || [])[(f._ || []).length - 1 - range.right[i]];
		if (!f || typeof f != 'object')
			range.right.splice(i+1);
	}
	
	// let's reintegrate the changes back to the faux map		
	this.CopyNodeToFaux(range);

	if (this.ChangedCallback)
		this.ChangedCallback(range);
}

// this would be very useful for deciding if a property mutation merited a save, or how much of a paste mattered.
// this generically works well but some properties are special and need custom serializer/deserializer and custom node-faux compare
var hh_virtual_whitelist = {
	INPUT: [ 'checked', 'value', 'type' ],
	IMG: [ 'data-hh-location', 'src' ],
	A: [ 'href' ],
	FONT: [ 'size', 'color' ],
	PATH: [ 'd', 'stroke' ],
	POLYGON: [ 'points' ],
	SVG: [ 'width', 'height', 'viewBox', 'preserveAspectRatio' ],
	LABEL: [ 'data-hh-location', 'data-image', 'data-youtube' ],
	DIV: [ 'data-hh-size', 'data-hh-title' ]
}
var hh_virtual_whitelist_ns = [ 'SVG', 'POLYGON', 'PATH' ];

// we also would like #contentareagutter > * [ 'data-hh-location' ]

function generate_node_from_faux(f)
{
	if (typeof f == 'string')
		return document.createTextNode(f);
		
	if (!f || typeof f != 'object')
		return document.createTextNode('');
	if (f.tag=='SCRIPT' || f.tag=='STYLE' || f.tag=='IFRAME')
		return document.createTextNode('');
		
	// any element I guess ought to have the same namespace it's being inserted into. 
	var isSVG_NS = (f.tag=='SVG'||f.tag=='PATH'||f.tag=='POLYGON');
	var node = isSVG_NS ? document.createElementNS('http://www.w3.org/2000/svg',f.tag.toLowerCase()) : document.createElement(f.tag || 'SPAN');
	/*if (f.id)
		node.id = f.id;*/
	var c = f.class;
	if (c)
	{
		if (!isSVG_NS)
			try { node.className = f.class; } catch (e) {}
		else
			node.setAttributeNS(null, 'class', f.class);
	}
	
	(hh_virtual_whitelist[f.tag] || []).forEach((p) => {
		//console.log(f.tag,p,f)
		if (p in f)
			(isSVG_NS) ? node.setAttributeNS(null, p, f[p]) : node.setAttribute(p, f[p]);
	});
	
	if (f.tag == 'INPUT')
	{
		if (node.type == 'password')
			node.type = 'text';
		//if (f.hasOwnProperty('type'))
		//	node.setAttribute('type', f['type']);
		if (f.hasOwnProperty('checked'))
			node.checked = f['checked'];
		if (f.hasOwnProperty('value'))
			node.value = f['value'];
		//console.log(f);
	}
	if (f.tag == 'IMG')
	{
		/*if ('src' in f)
			node.src = f['src'];*/
		node.setAttribute('draggable', false);
	}
	if (f.tag == 'A')
	{
		node.classList.add('gutter');
		/*if (f.hasOwnProperty('href'))
			node.href = f['href'];*/
	}
	
	if (f.tag == 'LABEL' && f['data-image'])
	{
		//node.setAttribute('data-image', f.dataImage);
		var img = generate_node_from_faux({ tag: 'IMG', class: '', src: f['data-image'] });
		if (f['width'] && f['height'])
		{
			img.width = parseInt(f['width']);
			img.height = parseInt(f['height']);
			//console.log(f['width'],f['height'],img);
		}
		// since it may have already loaded, i dunno why the text jumps though
		img.onload = (()=>{ var i=img, l=node; return ()=>{ 
			i.removeAttribute('width'); 
			i.removeAttribute('height'); 
			gutter_float_shape_outside(l);
			} })();
		gutter_float_shape_outside(node);
		node.appendChild(img);
	}
	else if (f.tag == 'LABEL' && f['data-youtube'])
	{
		//node.setAttribute('data-youtube', f.dataYoutube);
		var iframe = document.createElement('iframe');
		iframe.width=560;
		iframe.height=315;
		iframe.frameBorder=0;
		iframe.allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
		iframe.allowFullScreen="true";
		iframe.src="https://www.youtube.com/embed/" + f.dataYoutube;
		node.appendChild(iframe);
	}
	else if (f._) 
	{
		for (var i = 0; i < f._.length; i++)
			node.appendChild(generate_node_from_faux(f._[i]));
	}
	
	if (f.tag == 'SVG')
	{
		gutter_float_shape_outside(node);
	}

	if (f['data-hh-location'])	// for floaters
		{
			var left = parseInt(f['data-hh-location'].split(',')[0]), right = parseInt(f['data-hh-location'].split(',')[1]);
			if (left) node.style.marginLeft = left+'px';
			if (right) node.style.marginRight = right+'px';
		}	
	if (f['data-hh-size'])
		{
			var width = parseInt(String(f['data-hh-size']).split(',')[0]), height = parseInt(String(f['data-hh-size']).split(',')[1]);
			if (width) node.style.width = width+'px';
			if (height) node.style.height = height+'px';
			//console.log(f['data-hh-size'],f['data-hh-size'].split(','),width,height);
		}	

	return node;
}

function generate_faux_from_node(child)
{
	if (child.nodeType === 3)
	{
		return child.nodeValue;
	}
	else if (child.nodeType === 1)
	{
		var f = {};
		if (child.nodeName)
		{
			f.tag = child.nodeName.toUpperCase();

			/*if (child.id)
				f.id = child.id;*/

			var isSVG_NS = (f.tag=='SVG'||f.tag=='PATH'||f.tag=='POLYGON');
			if (isSVG_NS)
			{
				if (child.hasAttributeNS(null,'class'))
					f.class = child.getAttributeNS(null,'class');
			}
			else
			{
				if (child.hasAttribute('class'))
				{
					f.class = child.getAttribute('class');
				}
			}

			(hh_virtual_whitelist[f.tag] || []).forEach((p) => {
				if (child.hasAttribute(p))
					f[p] = child.getAttribute(p);
			});

			if (f.tag == 'INPUT')
			{
				/*if (child.hasAttribute('type'))	
					f['type'] = child.getAttribute('type');*/
				//if (child.checked)	
					f['checked'] = child.checked;	// getAttribute doesn't work for checked in safari. weird
				if (child.value)	
					f['value'] = child.value;	
			}
			else if (f.tag == 'IMG')
			{
				/*if (child.hasAttribute('src'))	
					f['src'] = child.getAttribute('src');*/
			}
			else if (f.tag == 'A')
			{
				/*if (child.hasAttribute('href'))	
					f['href'] = child.getAttribute('href');*/
			}
			else if (f.tag == 'PATH')
			{
				/*if (child.hasAttribute('d'))	
					f['d'] = child.getAttribute('d');
				if (child.hasAttribute('stroke'))	
					f['stroke'] = child.getAttribute('stroke');
				if (child.hasAttribute('vector-effect'))	
					f['vector-effect'] = child.getAttribute('vector-effect');*/
			}
			else if (f.tag == 'POLYGON')
			{
				/*if (child.hasAttribute('points'))	
					f['points'] = child.getAttribute('points');*/
			}
			else if (f.tag == 'SVG')
			{
				/*var bcr = child.getBoundingClientRect();
				if (child.hasAttribute('height'))	
					f['height'] = parseInt(child.getAttribute('height'));
				if (child.hasAttribute('width'))	
					f['width'] = parseInt(child.getAttribute('width'));
				if (child.hasAttribute('viewBox'))	
					f['viewBox'] = child.getAttribute('viewBox');
				if (child.hasAttribute('preserveAspectRatio'))	
					f['preserveAspectRatio'] = child.getAttribute('preserveAspectRatio');*/
			}
			else if (f.tag == 'LABEL')
			{
				if (child.getAttribute('data-image'))	
				{
					//f['data-image'] = child.getAttribute('data-image');
					var img = child.querySelector('img');
					if (!img)
						{ img = document.createElement('img'); img.src = child.getAttribute('data-image'); }
					f['width'] = child.offsetWidth || img&&img.naturalWidth || 0;
					f['height'] = child.offsetHeight || img&&img.naturalHeight || 0;
				}
				if (child.getAttribute('data-youtube'))	
				{
					//f['data-youtube'] = child.getAttribute('data-youtube');
				}
			}
			
		}
		
		if (child.childNodes.length)
		{
			f._ = [];
			for (var c = 0; c < child.childNodes.length; c++)
				f._.push(generate_faux_from_node(child.childNodes[c]));
		}
		return f;
	}
	// otherwise a comment node or something is null
}



var VirtualDOM_OutputHTML = function(faux)
{
	var out = [];

	(function inner(faux)
	{
		var entag = (faux.tag || faux.id || faux.class) ? (faux.tag || 'SPAN') : null;
		if (entag)
		{
			var c = faux.class;
			out.push('<' + entag + (faux.id ? ' id=\'' + faux.id + '\'' : '')  + (c ? ' class=\'' + c + '\'' : '' ) + '>');
		} 
		for (var i = 0; i < faux._.length; i++)
		{
			if (typeof faux._[i] === 'string')
				out.push(faux._[i].replace(/&/g,'&amp;').replace(/</g,'&lt;'));
			else
				inner(faux._[i]);
		}
		if (entag)
		{
			out.push('</' + entag + '>');
		}
	})(faux);
	
	var html = out.join('');
	return html;
}

VirtualDOM.prototype.ElementToPath = function(target)
{
	var path = [];
	while (target !== this.node)
	{
		if (!target.parentNode)
			return;
		var index = Array.prototype.indexOf.call(target.parentNode.childNodes, target);
		path.unshift(index);
		target = target.parentNode;
	}
	return path;
}

VirtualDOM.prototype.PathToElement = function(path)
{
	var node = this.node;
	for (var i = 0; i < path.length; i++)
		node = node.childNodes[path[i]];
	return node;
}

VirtualDOM.prototype.GetSel = function()
{
	var wgs = window.getSelection();
	return { 
		anchor: wgs.anchorNode && this.ElementToPath(wgs.anchorNode),
		anchorOffset: wgs.anchorOffset,
		focus: wgs.focusNode && this.ElementToPath(wgs.focusNode),
		focusOffset: wgs.focusOffset
		};
}

VirtualDOM.prototype.SetSel = function(sel)
{
	var wgs = window.getSelection(), anchorRange = document.createRange(), focusRange = document.createRange();
	
	if (sel.anchor)
		anchorRange.setStart(this.PathToElement(sel.anchor), sel.anchorOffset || 0);
	else
		anchorRange.setStart(wgs.anchorNode, wgs.anchorOffset);
	
	if (sel.focus)
		focusRange.setStart(this.PathToElement(sel.focus), sel.focusOffset || 0);
	else
		focusRange.setStart(wgs.focusNode, wgs.focusOffset);

	wgs.removeAllRanges();
	wgs = window.getSelection();
	
	var compareTo = ((focusRange.startContainer.nodeType==1) && focusRange.startContainer.childNodes[focusRange.startOffset]) || focusRange.startContainer;
	var position = anchorRange.startContainer.compareDocumentPosition(compareTo);
	if ((!position && anchorRange.startOffset > focusRange.startOffset) || (position | Node.DOCUMENT_POSITION_PRECEDING))
	{
		focusRange.collapse(false);
		window.getSelection().addRange(anchorRange);
		window.getSelection().extend(focusRange.startContainer, focusRange.startOffset);
	}
	else
	{
		anchorRange.setEnd(focusRange.startContainer, focusRange.startOffset);
		window.getSelection().addRange(anchorRange);
	}
}

VirtualDOM.prototype.CopyFauxAndNode = function(range, overwrite_nodes_function)
{
	// clone some of faux to/from some of node. range is assumed to be fresh and refer to the real situation, not wrong in any way. otherwise results may differ from intended.
	var faux = this.faux, node = this.node, level = 0;
	if (!range)
		range = { left: [0], right: [0] };
		
	// skip up through single common elements.
	// suppose node is <left><cen ter><another><right> ; faux is <left><cen TER><right> ; range is [1,1],[1]. Then the skip won't happen, as desired
	while (level < Math.min(range.left.length, range.right.length)-1
		&& range.left[level] == node.childNodes.length - 1 - range.right[level])
	{
		faux = faux._[range.left[level]];
		node = node.childNodes[range.left[level]];
		level++;
	}
	
	var oldfaux = faux, oldnode = node, oldlevel = level;
	
	// replace left endpoints 
	while (level < range.left.length - 1)
	{
		faux = faux._[range.left[level]];
		node = node.childNodes[range.left[level]];
		level++;
		
		var left_keep = range.left[level] + (level == range.left.length ? 1 : 0);
		overwrite_nodes_function(faux, left_keep, faux._.length - left_keep, node, left_keep, node.childNodes.length - left_keep);
	}
		
	// overwrite central non-endpoint elements
	faux = oldfaux; node = oldnode; level = oldlevel;
	var left_keep = range.left[level] + (level != range.left.length-1 ? 1 : 0), right_keep = range.right[level] + (level != range.right.length-1 ? 1 : 0);
	overwrite_nodes_function(faux, left_keep, faux._.length - left_keep - right_keep, node, left_keep, node.childNodes.length - left_keep - right_keep);
	
	// replace right endpoints
	faux = oldfaux; node = oldnode; level = oldlevel;
	while (level < range.right.length - 1)
	{
		faux = faux._[faux._.length - 1 - range.right[level]];
		node = node.childNodes[node.childNodes.length - 1 - range.right[level]];
		level++;
		
		var faux_length = faux._ ? faux._.length : 0;
		var right_keep = range.right[level] + (level == range.right.length ? 1 : 0);
		overwrite_nodes_function(faux, 0, faux_length - right_keep, node, 0, node.childNodes.length - right_keep);
	}
}

// CopyFauxToNode + CopyNodeToFaux are almost the same...factor out and you'll also be able to read off text
VirtualDOM.prototype.CopyFauxToNode = function(range)
{
	var connected = this.connected;
	this.disconnect();
	this.CopyFauxAndNode(range, overwrite_nodes_from_faux_to_node);
	if (connected)
		this.connect();
		
	function overwrite_nodes_from_faux_to_node(faux, fauxIndex, fauxCount, node, nodeIndex, nodeCount)
	{
		while (nodeCount > 1)	// leave one to replace
		{
			nodeCount--;
			node.removeChild(node.childNodes[nodeIndex + nodeCount]);
		}
		
		var fragment;
		if (fauxCount == 1)
			fragment = generate_node_from_faux(faux._[fauxIndex]);
		else
		{
			fragment = document.createDocumentFragment();
			for (var i = 0; i < fauxCount; i++)	
			{
				fragment.appendChild(generate_node_from_faux(faux._[fauxIndex+i]));
			}
		}
		
		if (nodeCount)
			node.replaceChild(fragment, node.childNodes[nodeIndex]);
		else if (nodeIndex < node.childNodes.length)
			node.insertBefore(fragment, node.childNodes[nodeIndex]);
		else
			node.appendChild(fragment);
	}
}

VirtualDOM.prototype.CopyNodeToFaux = function(range)
{
	this.CopyFauxAndNode(range, overwrite_nodes_from_node_to_faux);

	function overwrite_nodes_from_node_to_faux(faux, fauxIndex, fauxCount, node, nodeIndex, nodeCount)
	{

		// push in some new ones
		var newones = [];
		for (var i = 0; i < nodeCount; i++)	
			newones.push(generate_faux_from_node(node.childNodes[nodeIndex+i]));
		
		faux._ = faux._.slice(0, fauxIndex).concat(newones).concat(faux._.slice(fauxIndex+fauxCount));
	}

}

VirtualDOM.prototype.UnchangedEdges = function()
{
	// left_path is how many elements match on the left.
	var left = (function scan_left(node, faux) 
	{
		var max = Math.min(node.childNodes.length, faux._.length);
		
		for (var i = 0; i < max; i++)
		{
			var child = node.childNodes[i], f = faux._[i];

			if (!f)
			{
				// f is null so there's a <!--comment!--> or something in childNodes
				if (child.nodeType === 1 || (child.nodeType === 3 && !!child.nodeValue))
					break;
			}
			else if (typeof f == 'string')
			{
				if (child.nodeType !== 3 || f != child.nodeValue)
					break;
			}
			else 
			{
				if (child.nodeType !== 1)
					break;
				if ((f.tag || 'SPAN') != child.nodeName.toUpperCase())
					break;
				var c = f.class;
				if ((c||'') != child.className)
					break;
				if ((f.id||'') != child.id)
					break;
				// need to check declared attributes! But since we don't use unchanged edges in hyperhello yet.
				console.log('unimplemented code to check for attributes');
				
				var result = scan_left(child, f);
				if (result)
					return [i].concat(result);
			}
		}
		
		if (i != max || (node.childNodes.length != faux._.length))
		{
			// we broke out, or just stopped because there were more elements
			return [i];
		}
	})(this.node, this.faux);
	
	if (!left)	// no divergence was found in scan
		return;	
	
	var right = (function scan_right(node, faux, path, level)
	{
		//console.log('scanning ' + level + ' of ' + path,node,faux);
		// if left stopped because it ran out of common elements, max will be -1. That's fine
		var faux_length = faux._ ? faux._.length : 0;
		var max = Math.min(node.childNodes.length, faux_length) - (path ? path[level] + (node.childNodes.length == faux_length ? 1 : 0) : 0);
		
		for (var i = 0; i < max; i++)
		{
			var child = node.childNodes[node.childNodes.length - 1 - i], f = faux._[faux._.length - 1 - i];

			if (!f)
			{
				// f is null so there's a <!--comment!--> or something in childNodes
				if (child.nodeType === 1 || (child.nodeType === 3 && !!child.nodeValue))
					break;
			}
			else if (typeof f == 'string')
			{
				if (child.nodeType !== 3 || f != child.nodeValue)
					break;
			}
			else 
			{
				if (child.nodeType !== 1)
					break;
				if ((f.tag || 'SPAN') != child.nodeName.toUpperCase())
					break;
				var c = f.class;
				if ((c||'') != child.className)
					break;
				if ((f.id||'') != child.id)
					break;
										
				var result = scan_right(child, f);
				if (result)
					return [i].concat(result);
			}
		}
		
		// if we found something and broke, return it.
		var faux_length = faux._ ? faux._.length : 0;
		if (i < max || (node.childNodes.length != faux_length) || (path && level == path.length - 1))
		{
			return [i];
		}
		
		if (path && level < path.length-1)
		{
			// look inside a node containing the left change. however, are they both actually objects?! if <I>me</I>! becomes <I>me!</I>, you can't step in. that has to end.
			var result = scan_right(node.childNodes[path[level]], faux._[path[level]], path, level+1);
			if (result)
				return [i].concat(result);
		}
		
	})(this.node, this.faux, left, 0);
	
	return { left, right };
}

