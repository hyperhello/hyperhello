"use strict";

function create_pressed_activity(event)
{
	hh.pressed_state = hh.state;

	var closing_burger = (!hh.target.closest('#burger_menu > table') && document.querySelector('#burger.display'));
	
	if (closing_burger) 
	{
		if (document.querySelector('#burger').contains(document.activeElement))
		{
			document.activeElement.blur();
			return event.preventDefault();
		}
		document.querySelector('#burger').classList.remove('display');
	}
	
	if (hh.target.closest('.toolbar_tr') && !closing_burger)
		return create_toolbar_pressed_activity(event);
	
	if (closing_burger && hh.target.closest('#maintable'))
		return event.preventDefault();
	
	// ok the input item chosen is not quite as important as what's already under the mouse...keep playing with it!
	//alert(['clicking screen',hh.pen,hh.tool,hh.tool_set_by_pen]);
	// mouse, click, and drag_bounds are in content area coordinates
	
	if (hh.pointerType == 'pen' && hh.tool == 'type' && !hh.tool_set_by_pen)
	{
		// i would like a pen touch in type mode to become paint, unless the pen was in charge of setting the tool before.
		hh_set_tool('paint');
		hh.tool_set_by_pen = true;	// penning into the field 
		//event.preventDefault();
		// however maybe the pen should NOT steal paint focus if there is a visible selection in the text, or if you click the text with the pen.
		
	}
	else if (hh.pointerType != 'pen' && hh.tool == 'paint' && hh.tool_set_by_pen)
	{
		// a finger touch in paint mode should become a typestroke, unless the finger was in charge of entering paint mode.
		hh_set_tool('type');
		hh.tool_set_by_pen = false;
		//alert("!hh.pen && hh.tool == 'paint' && hh.tool_set_by_pen");
	}
	
	if (event.target === contentareapaintoverlay)
		{
			return create_paint_tool_pressed_activity(event);
		}
	if (!event.target.closest('#contentarea'))
		return;
	
	// once you set the pen to paint, i think maybe your finger
	// double clicks need to be timed from mouseup, not mosuedown! I think rect-small-and-finish needs to be in event handler. or maybe use ondblclick
	if (hh.tool == 'type')
		return create_type_tool_pressed_activity(event);
	else if (hh.tool == 'paint') 
	{
		if (pt_inside_rect(hh.state.fixed, clientRect(document.getElementById('contentareapaintoverlay'))))
			return create_paint_tool_pressed_activity(event);
		//else
		//	return create_type_tool_pressed_activity(event);
	}
	else return function(finish)
	{
		//put('click',hh.state.content,hh.pointerType,finish);
		//if (hh.target.closest('#contentarea') && !hh.target.closest('button, input')) { event.preventDefault(); }
	}
}

function create_toolbar_pressed_activity(event)
{
	if (hh.target && hh.target.closest && hh.target.closest('[contenteditable=true]')) return;
	
	var atest;
	if (atest=document.querySelector('#burger A.rename_file')) 
	{
		atest.classList.remove('rename_file');
		atest.blur();
		return event.preventDefault(); 
	}
	
	// everything here can have onclick delivered 
	event.supportClickThrough = true;
	event.preventDefault();
	//if (!hh.target.matches('select')) event.preventDefault();

	if (hh.target.closest('#burger'))
	{
		if (hh.target.id=='burger') { 
			//put('toggle burger', event.type);
			//hh_list_files_in_menu();	// do it before show now. never mind, it's fine
			
			var checkedfile = hh.target.querySelector('#burger_filelist .burger_menuitem[data-filename][data-checked=true]');
			if (checkedfile)
				checkedfile.scrollIntoView();
			hh.target.classList.toggle('display'); 
			}
		return event.preventDefault(); 
	}
	
	/*if (hh.target.closest('.ignore_down'))
		event.preventDefault();*/
		
	// before the tool changes
	if (hh.target.closest('.hh_paint_set_color_to_textcolor') && hh.tool=='paint')
	{
		set_color('--text-color');
		//document.execCommand('foreColor', false, hh.color);
	}
	
	var tool = hh.target.closest('.hh_set_tooltoid'), tool_changed;
	if (tool && (tool_changed=(hh.tool!=tool.id))) 	// because of a bug changing the html of buttons while the click is in progress, we don't set the tool unless we have to
	{
		hh_set_tool(tool.id); 
	}
				
	var canvas = hh.target.closest('.hh_canvas_swatch');	// this pattern over and over....
	if (canvas)
	{
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		var colors = ['--red','--orange','--yellow','--green','--purple','--blue','gray'];
		var ctx = canvas.getContext('2d');
		var gradient = ctx.createLinearGradient (0, 0, canvas.width, 0);

		for (var i=0; i < colors.length; i++) 
			gradient.addColorStop (i/(colors.length-1), css_evaluate(colors[i]));

		ctx.fillStyle = gradient;
		ctx.fillRect (0, 0, canvas.width, canvas.height);

		var selected_paths = (hh.tool=='type' ? catd.querySelectorAll('svg.gutter path.selected') : []);
		selected_paths.forEach((e)=>e.classList.toggle('selected',false));

		return function(finish)
		{
			document.getElementById('contentareacursor').style.left = hh.state.fixed[0]-14+'px';
			document.getElementById('contentareacursor').style.top = hh.state.fixed[1]-15+'px';
			
			var bcr = canvas.getBoundingClientRect(),
				x = (hh.state.client[0] - bcr.x) * window.visualViewport.scale,
				inside_horiz = (x >= 0 && x < canvas.width),
				inside_vert = (hh.state.client[1] >= bcr.y && hh.state.client[1] < bcr.bottom);
			//console.log(x, inside_horiz, inside_vert);
			
			if (inside_horiz && inside_vert)
			{
				var rgba = ctx.getImageData (x, 0, 1, 1).data;
				set_color("#" + ((1 << 24) + (rgba[0] << 16) + (rgba[1] << 8) + rgba[2]).toString(16).slice(1));
				//set_color('rgba(' + rgba.slice(0,4).join(',') + ')');
			}
			else if (!inside_vert)
			{
				// this should properly be strip color formatting
				set_color('--text-color');
			}

			document.body.classList.toggle('hh_canvas_swatch_active', !finish && (inside_vert || inside_horiz));
						
			if (selected_paths.length)
			{
				gutter_virtual_dom.BeginUndoableMutations();	// who says this is in the gutter? this whole path is shaky.
				selected_paths.forEach((e)=>e.setAttributeNS(null,'stroke',css_evaluate(hh.color)));
				gutter_virtual_dom.FinishUndoableMutations(true);
			}

			if (finish)
			{
				selected_paths.forEach((e)=>e.classList.toggle('selected',true));
			}
			
			if (finish && finish != 'cancel' && hh.tool=='type')
			{
				if (!selected_paths.length)
				{
					document.execCommand('foreColor', false, css_evaluate(hh.color));
				}
				
				// this is the set color action 
				/*var selectabled = catd.querySelectorAll('svg.gutter path.selected');
				if (selectabled.length)
				{
					//gutter_virtual_dom.BeginUndoableMutations();	// who says this is in the gutter? this whole path is shaky.
					selectabled.forEach((e)=>e.setAttributeNS(null,'stroke',css_evaluate(hh.color)));
					//gutter_virtual_dom.FinishUndoableMutations(true);
				}
				else
				{
					document.execCommand('foreColor', false, css_evaluate(hh.color));
				}*/
			}
		}
	}
}

function create_type_tool_pressed_activity(event)
{
	var is_mouse_in_selection_box = undefined;

	function is_mouse_inside_text()
	{
		var click_range;
		if (document.caretPositionFromPoint) {
			var pos = document.caretPositionFromPoint(hh.event.pageX, hh.event.pageY);
			click_range = document.createRange();
			click_range.setStart(pos.offsetNode, pos.offset);
			click_range.collapse();
		}
		else if (document.caretRangeFromPoint) {
			click_range = document.caretRangeFromPoint(hh.event.pageX, hh.event.pageY);
		}
		
		return !!(click_range && pt_inside_rect(hh.state.fixed, clientRect(click_range).map((v,i)=>(v+[-8,-8,+8,+8][i]))));
	}
	
	is_mouse_in_selection_box = is_mouse_inside_text();
	//console.log(clientRect(click_range), is_mouse_in_selection_box);
	
	if (hh.target.matches('label.gutter > input'))
	{
		// block input clicking stuff in text mode
		event.preventDefault();
	}
	else if (hh.target.matches('img'))
	{
		var range = new Range();
		range.selectNode(hh.target);
		window.getSelection().removeAllRanges();
		window.getSelection().addRange(range);
	}
	
	var ever_dragged = false;
	var selectables = cag.querySelectorAll('.gutter:not(svg), svg.gutter path');
	//var target_gutter = hh.target.closest('#contentareagutter .gutter');

	//put("type");
	var long_press = false, long_press_timeout = setTimeout(()=>{ 
		if (!ever_dragged)
		{
			//put("100ms long press!");
			long_press = true;
			//if (target_gutter) target_gutter.classList.add('selected');
			finish();
		}
	}, Math.max(0,(hh.state.time+(hh.pointerType=='touch' ? 100 : 0) - Date.now())));

	/*Array.prototype.forEach.call(selectables,(g)=>{
		if (g===target_gutter || !hh.state.shift)
			g.classList.toggle('selected',(!is_mouse_in_selection_box || true) && (g===target_gutter));
	});
	
	console.log(target_gutter, hh.state.double_click)
	if (hh.pointerType == 'mouse' && target_gutter && hh.state.double_click)
	{
		show_modal_dialog(target_gutter);	// didn't work because targetgutter isn't there
		return;
	}*/
	
	// Fix type presses, there’s a way that feels natural. Did the click start in text, in a gutter object, or in no mans land? Make Links and Images work in the dialog, just like templates would. A button to “do something to the selection” would be great.    
		
	// if the mouse is being used for text from the beginning, don't show any ants.
	var round=0, dragger_activity, dont_trigger_dragger;
	return finish;
	function finish(finish)
	{
		if (dragger_activity) return dragger_activity(finish);

		round++;
		//is_mouse_in_selection_box = is_mouse_inside_text();	// hmmmmm

		var drag_minmax = [
			Math.min(hh.pressed_state.content[0],hh.state.content[0]),
			Math.min(hh.pressed_state.content[1],hh.state.content[1]),
 			Math.max(hh.pressed_state.content[0],hh.state.content[0]),
			Math.max(hh.pressed_state.content[1],hh.state.content[1])
			];
			
		ever_dragged = ever_dragged || Math.pow(drag_minmax[2]-drag_minmax[0],2)+Math.pow(drag_minmax[3]-drag_minmax[1],2) > 8;

		caa.style.left = drag_minmax[0]+'px';
		caa.style.top = drag_minmax[1]+'px';
		caa.style.width = drag_minmax[2]-drag_minmax[0] + 1 +'px';
		caa.style.height = drag_minmax[3]-drag_minmax[1] + 1 +'px';
		caa.style.display = 'inherit';
		put(hh.state.content);
		/*if (is_mouse_in_selection_box === false || hh.state.triple_click)
		{
			document.body.classList.toggle('block_scrolling',true);
			document.body.classList.toggle('show_ants',true);
			//cai.classList.toggle('selectionshield', true);
			caa.style.display = 'inherit';
			//hh.event.preventDefault();
		}*/
		
		var intersections = [];

		var caa_cr = clientRect(caa);
		
		if (!is_mouse_in_selection_box)
		{
			for (var i = selectables.length-1; i >= 0; i--)	// going backwards isn't right for svg though
			{
				var gutter_cr = clientRect(selectables[i]);
				var rect_intersect = rect_intersects_rect(caa_cr, gutter_cr);
							
				if (rect_intersect && !rect_inside_rect(gutter_cr, caa_cr) && selectables[i].matches('svg path'))
				{
					// narrow down the hit area if it's not entirely inside
					var test_rect = ever_dragged ? caa_cr : caa_cr.map((v,i)=>(v+[-4,-4,+4,+4][i]));
					var common_rect = [ Math.max(test_rect[0],gutter_cr[0]), Math.max(test_rect[1],gutter_cr[1]),
						Math.min(test_rect[2],gutter_cr[2]), Math.min(test_rect[3],gutter_cr[3])	];
					rect_intersect = hit_test_svg_path(selectables[i], common_rect);
				}
				else if (rect_intersect && rect_inside_rect(caa_cr, gutter_cr))
				{
					if (selectables[i].matches('img,label[data-image]'))
					{
						//console.log('img intersect');
					}
					else if (long_press && selectables[i].matches('label,input,button'))
					{
						//console.log('label,input,button intersect');
					}
					else rect_intersect = false;	// select container, or text inside??
				}
				/*
				else if (rect_intersect && rect_inside_rect(caa_cr, gutter_cr) && is_mouse_inside_text() && !selectables[i].matches('img'))
				{
					// if the click and drag is entirely inside a gutter object (except an image), give the benefit of the doubt 
					rect_intersect = false;
				}*/
				
				// intersections of sub-objects override parent objects, so don't add parents and kick em out if they're there
				if (rect_intersect && !intersections.some((e)=>selectables[i].contains(e)))
				{
					intersections = intersections.filter((e)=>!e.contains(selectables[i]));
					intersections.push(selectables[i]);
				}
				//if (rect_intersect || !hh.state.shift)
	//						selectables[i].classList.toggle('selected', rect_intersect);
			}
		}
		
		if (!dont_trigger_dragger && ever_dragged && intersections.length && intersections[0].matches('#contentareagutter > .gutter.selected'))
		{
			dragger_activity = create_dragger_activity(event, intersections[0]); 
			finish = true;
		}
		else if (ever_dragged)
		{
			dont_trigger_dragger = true;
		}
		//console.log(intersections);
		
		// need shift key support
		// don't show ants if the antbox has never crossed the edges 
		var ants = !!intersections.length /*&& intersections.some((element)=>element.matches('svg path'))*/;
		cai.classList.toggle('selectionshield', ants);
		document.body.classList.toggle('show_ants',ants);
		document.body.classList.toggle('block_scrolling',ants);
		
		selectables.forEach((e)=>e.classList.toggle('selected', !!intersections.length && intersections.indexOf(e)!=-1));
		
		var r;
		intersections.forEach((i)=>{
			if (!r) (r=new Range()).selectNode(i);
			///else if (!r.isPointInRange(i,0)) {}	// of course we want to select them all but let's just sel first
		});

		if (r) {
			hh.wgsr = new Range();
			window.getSelection().removeAllRanges();
			window.getSelection().addRange(r);	// this doesn't seem to work really
			cai.querySelectorAll('.gutter.selected').forEach((e)=>e.classList.remove('selected'));
		//	document.querySelectorAll('#dec_dialog').forEach((d)=>{ d.innerText = intersections[0] ? intersections[0].nodeName : "..." });;
		}
		if (intersections[0])
			update_dec_dialog(intersections[0]);
//console.log(first_clicked);
		/*var hide_selection = false;
		if (first_clicked && !is_mouse_in_selection_box)
		{
			var wgs = window.getSelection();
			var a = (wgs.anchorNode && first_clicked && (wgs.anchorNode===first_clicked || first_clicked.contains(wgs.anchorNode)));
			var f = (wgs.focusNode && first_clicked && (wgs.focusNode===first_clicked || first_clicked.contains(wgs.focusNode)));
			hide_selection = (!a || !f);
			{
				//window.getSelection().removeAllRanges();
				//wgs.collapse(wgs.anchorNode,wgs.anchorOffset);	// this doens't seem to stick. but it would be nice
			}
		}
		cai.classList.toggle('selectionshield', hide_selection);*/

		// this is SOO much better than before. Still needs single and double clicks on inner .gutters to make sense (select and inspect). Then strip out the whole .gutter class, have basic html5 tags with [data-hyperhello-marching-ants=true] and see how it works on other people's pages as a browser extension.
		// Also, what about clicking in gutter objects? Why is label z-index 1 still? 
		
		var target = intersections[0] || (hh.target && hh.target.matches && hh.target.matches('img') && hh.target);
		
		if (round==1 && target && hh.state.double_click)
		{			
			show_modal_dialog(target);
			// now how to finish?
			event.preventDefault();
			return cancel_pressed_activity(); 
		}
		
		if (finish)
		{
			//console.log(caa_cr);
			clearTimeout(long_press_timeout);
			
			document.body.classList.toggle('block_scrolling',false);
			document.body.classList.toggle('show_ants',false);
			caa.style.display = 'none';
		}
	}
}
function create_dragger_activity(event, draggy_div)
{
	var draggy_offset = [hh.state.page[0] - eleft(draggy_div), hh.state.page[1] - etop(draggy_div)];
	//draggy_offset = [event.pageX - draggy_div.offsetLeft, event.pageY - draggy_div.offsetTop ];
	put(event.target, draggy_offset);
	event.preventDefault();
	//draggy_div.setPointerCapture(event.pointerId);
	//draggy_div.style.outline='thin dotted gray';
	gutter_virtual_dom.BeginUndoableMutations();

	return function(finish)
	{
		if (hh.event) hh.event.preventDefault();
		
		// bleah. We need positioning!
		draggy_div.classList.toggle('left', hh.state.page[0] <= window.innerWidth/2);
		draggy_div.classList.toggle('right', hh.state.page[0] > window.innerWidth/2);
		
		var isRight = draggy_div.classList.contains('right');
		
		var new_lt = [Math.max(0,Math.min(hh.state.page[0],window.innerWidth)) - draggy_offset[0], 
			Math.max(0,hh.state.page[1]) - draggy_offset[1]];
		//console.log(new_lt);
		
		draggy_div.style.marginRight = isRight ? (window.innerWidth - ewidth(draggy_div) - new_lt[0]) + 'px' : 'initial';
		draggy_div.style.marginLeft = !isRight ? (new_lt[0]) + 'px' : 'initial';
		draggy_div.setAttribute('data-hh-location', [(!isRight&&parseInt(draggy_div.style.marginLeft))||'',(isRight&&parseInt(draggy_div.style.marginRight))||'']);
		
		var dd_prev = draggy_div;
		while (dd_prev=dd_prev.previousElementSibling)
			{
				if (!dd_prev.matches('.gutter' + (isRight?'.right':'.left')))
					continue;
				
				if (!dd_prev.classList.contains('spacer'))
					dd_prev = null;
				break;
			}
		if (!dd_prev)
			{ dd_prev = document.createElement('div'); dd_prev.className = 'gutter spacer '+ (isRight?'right':'left'); contentareagutter.insertBefore(dd_prev, draggy_div); console.log('created prev spacer',dd_prev); }
		
		/*var dd_prev = draggy_div.previousElementSibling;
		if (!dd_prev || !dd_prev.matches('.gutter.spacer' + (isRight?'.right':'.left')))
		{ dd_prev = document.createElement('div'); dd_prev.className = 'gutter spacer '+ (isRight?'right':'left'); contentareagutter.insertBefore(dd_prev, draggy_div); console.log('created prev spacer'); }*/
		
		var dd_next = draggy_div;
		while (dd_next=dd_next.nextElementSibling)
			{
				if (!dd_next.matches('.gutter' + (isRight?'.right':'.left')))
					continue;
				
				if (!dd_next.classList.contains('spacer'))
					dd_next = null;
				break;
			}
		if (!dd_next)
			{ dd_next = document.createElement('div'); dd_next.className = 'gutter spacer '+ (isRight?'right':'left'); contentareagutter.insertBefore(dd_next, draggy_div.nextElementSibling); console.log('created next spacer',dd_next); }
		
		var dd_prev_margin = etop(draggy_div) - (etop(dd_prev)+eheight(dd_prev));
		
		/*var dd_next = draggy_div.nextElementSibling;
		if (!dd_next || !dd_next.matches('.gutter.spacer' + (isRight?'.right':'.left')))
		{ dd_next = document.createElement('div'); dd_next.className = 'gutter spacer '+ (isRight?'right':'left'); contentareagutter.insertBefore(dd_next, draggy_div.nextElementSibling); console.log('created next spacer'); }*/
		
		var dd_next_margin = Math.max(0, etop(dd_next) - etop(draggy_div) - eheight(draggy_div));
		
		dd_next.style.height = Math.max(0, (etop(dd_next)+eheight(dd_next)) - (new_lt[1]+eheight(draggy_div)) - dd_next_margin) + 'px';
		dd_next.setAttribute('data-hh-size', ','+eheight(dd_next));
		
		dd_prev.style.height = Math.max(0, new_lt[1] - etop(dd_prev) - dd_prev_margin) + 'px';
		dd_prev.setAttribute('data-hh-size', ','+eheight(dd_prev));
		
		//if (dd_next)	// this is a little tricky because it apparently doesn't factor in margins of draggys
		//	dd_next.style.height = (dd_next.offsetTop+dd_next.offsetHeight-(new_lt[1]+draggy_div.offsetHeight)-8) + 'px';
		
		
		// the right way to do this is to preserve their rects and then adjust the spacers
		
		clean_up_float_order();
		
		if (finish)
		{
			//draggy_div.style.outline='';
			gutter_virtual_dom.FinishUndoableMutations(true);
		}	
	}

}

function create_paint_tool_pressed_activity(event)
{
	/* floating typeable/paintable elements to the gutter is quite complicated. The benefit is a simple progressive reflow doesn't trigger any scripted recalc.*/
	
	// works for now
	event.preventDefault();
	document.body.classList.toggle('block_scrolling',true);
	
	//var click_window = hh.target && hh.target.closest('.container.window');

	var windows = ca.querySelectorAll('.container.window'), click_window;
	for (var i = 0; i < windows.length && !click_window; i++)
		if (pt_inside_rect(hh.state.client,clientRect(windows[i]))) click_window = windows[i];

	document.getElementById('contentareacursor').classList.add('hidden');
	
	//alert(event.target);
	
	// did we start the path on top of an existing svg element?
	var createsvg, svg, ns = 'http://www.w3.org/2000/svg';//, range = element_caret_range(cag, event);	// this will find a clicked gutter element
	//alert(range);
	var dest = click_window || cag;
		
	svg = event.target && event.target.closest('svg.gutter');
	// if not, try the first svg
	if (!svg)
		svg = dest.querySelector('svg.gutter.right');
	// if not, float a new svg on the right
	
	// new style undo routines should be better. try it here first and then find a next step
	gutter_virtual_dom.BeginUndoableMutations();
	
	if (!svg)
	{
		// our crude remedy is to put a new svg at the end of the gutter. however this is grossly poor UI and it should expand a nearby one as needed instead
		// if it's not a click on one, put the new svg at the end
		createsvg = svg = generate_node_from_faux({ 
			tag: 'SVG', 
			class: 'gutter right', 
			width: 1, 
			viewBox: '0 0 1 1', 
			preserveAspectRatio: 'xMaxYMin slice' });
		dest.prepend(createsvg);
	}
	
	// start the path
	var path = [], svgpath = generate_node_from_faux({ 
		tag: 'PATH', 
		class: (hh.pointerType=='pen' ? ' pen' : ''), 
		stroke: hh.color,
		'vector-effect': 'non-scaling-stroke'
		});
	svg.append(svgpath);
		
	var reflow_debounce;	// making a debouncer with timer options and calls would be useful
	
	//svg.style.shapeOutside = '';
	finish();
	finish();
	return finish;
	function finish(finish)
	{
		if (hh.event) hh.event.preventDefault();

		if (finish == 'cancel')
		{
			// don't add any more screen points i guess, not that it matters 
			(createsvg || svgpath).parentNode.removeChild(createsvg || svgpath); 
			gutter_float_shape_outside(svg);
		}
		else
		{
			/*function screen_point_to_svg(pt, g)
			{
				var s = svg.createSVGPoint();
				s.x = pt[0];
				s.y = pt[1];
				var ctm = svg.getScreenCTM();
				// this is needed on mac...what about iphone?
				if (hh.safari) { var vvs = window.visualViewport ? window.visualViewport.scale : 1; ctm.e /= vvs; ctm.f /= vvs; }
				s = s.matrixTransform(ctm.inverse());
				//s.x -= (window.visualViewport.offsetLeft || 0);	
				//s.y -= (window.visualViewport.offsetTop || 0);
				if (g) { s = s.matrixTransform(g.getCTM().inverse()); }
				return [s.x,s.y];
			}*/

			var s = screen_point_to_svg(svg, hh.state.client);	// this will record the svg point *currently*
			//console.log(s);
			var pt = [s[0],s[1],hh.state.pressure];
			//put(pt,finish,hh.mouse_client);
			
			path.push(pt);
			var p = path.map((p)=>([Math.round(p[0]),Math.round(p[1])]));
			
			var d = 'M' + [p[0][0],p[0][1]] + ' ';
			
			// if there's 60, skip 6 at a time. but no more than 9 per curve. Really we should skip based on distance from current normal i guess.
			/*var skip = Math.min(Math.floor(p.length/10),9), halfskip = Math.ceil(skip/2);
			var lastI = 0, everQ;
			
			for (var i = 0; i < p.length; i++)
			{
				var pt = [p[i][0],p[i][1]];
				
				if (i+skip+1 < p.length)
				{
					if (i % (skip+1) != 0 || i==0)
						continue;
					if (everQ)
						d += 'T' + [p[i][0],p[i][1]] + ' ';
					else
						d += ['Q' + [p[i-halfskip][0],p[i-halfskip][1]], pt ].join(',') + ' ';
					//everQ = true;
				}
				else
					d += 'L' + [p[i][0],p[i][1]] + ' ';
			}*/
					
					// do it AGAIN with no polyline!
					//d += 'M' + [p[0][0],p[0][1]] + ' ';
					
					// ultra simple path
					if (p.length == 1 || p.length==2 && Math.pow(p[0][0]-p[1][0],2)+Math.pow(p[0][1]-p[1][1],2)<5)
					{
					}
					else
					{
						for (var i = 1; i < p.length; i++)
						{
							d += 'L' + [p[i][0],p[i][1]] + ' ';
						}
					}
									
			svgpath.setAttributeNS(null,'d',d);
			svgpath.classList.toggle('pen', (hh.pointerType=='pen') && p.length > 4);	// really want a bbox size
			svgpath.classList.toggle('bulge', (hh.pointerType=='pen') && p.length < 4);	// really want a bbox size
			
			// expand the svg element 
			var viewBox = [svg.viewBox.animVal.x,svg.viewBox.animVal.y,svg.viewBox.animVal.width||svg.getBoundingClientRect().width,svg.viewBox.animVal.height||svg.offsetHeight]/*.map(Math.round)*/;
			var svgBCR = svg.getBoundingClientRect();
			var reflow = false;
			
			//console.log(svg,viewBox);
			
			if (hh.state.client[0] < svgBCR.x)
			{
				// try to expand the width, though max-width may be operative on the element
				var old_scale = viewBox[2] / svgBCR.width;
				//svg.setAttributeNS(null,'width', svgBCR.right - hh.state.client[0]);
				svg.setAttribute('width', Math.ceil((viewBox[0] + viewBox[2] - s[0])/old_scale));
				// suppose the old viewBox width was 400 and the old real width was 300, that's 4/3 scale. now the new width is 330...that means the new viewBox width is 440.
				svgBCR = svg.getBoundingClientRect();
				var new_vb_width = svgBCR.width * old_scale;	// works but is it causing jitters due to fractional positioning?
				viewBox[0] = viewBox[0] + viewBox[2] - new_vb_width;
				viewBox[2] = new_vb_width;
				//svg.removeAttributeNS(null,'width');
				svg.setAttribute('viewBox', viewBox/*.map(Math.round)*/.join(' '));
				
				reflow = true;
			}
			if (hh.state.client[1] >= svgBCR.bottom)
			{
				// extend the viewBox downwards and let css worry about the height
				viewBox[3] = Math.ceil(s[1] - viewBox[1]);
				svg.setAttribute('viewBox', viewBox/*.map(Math.round)*/.join(' '));
				
				reflow = true;
			}
			
			// ok two problems: 
			// (1) setting the width in small mode makes the small width stick. better to set width as though it were 1:1 scale. Do we want to make the width css percentage? It's possible. Or make the width something that works with old_scale might be easier? if the svg is drawn doubled, width needs to be a multiple of 2? 
			// (2) viewbox changes are a little jittery, something is rounding off internally. that needs to be fixed at least *during* drawing
			// use case is someone edits a little picture on a phone, then it's tiny on the computer. pictures could have "percentage" or "pixels" setting
			if (true) {}
			else if (reflow)
			{
				clearTimeout(reflow_debounce);
				gutter_float_shape_outside(svg);	// this is very slow on ipad. need to rewrite path by path 
			}
			else if (!reflow_debounce)
			{
				clearTimeout(reflow_debounce);
				reflow_debounce = setTimeout(function() {
					reflow_debounce = null;
					gutter_float_shape_outside(svg);	// this is very slow on ipad. need to rewrite path by path 
				}, 1000);
			}
		}
		
		if (finish) 
		{
			clearTimeout(reflow_debounce);
			gutter_float_shape_outside(svg);	// this is very slow on ipad. need to rewrite path by path 
			gutter_virtual_dom.FinishUndoableMutations(finish!='cancel');
			var gutters = ca.querySelectorAll('.gutter');
			for (var i = 0; i < gutters.length; i++)
				gutters[i].classList.toggle('selected',gutters[i] === svgpath);
			document.body.classList.toggle('block_scrolling',false);
		}
	}		

}


// let's rename activities hover, down, click, doubleclick maybe
function create_clicked_activity(event)
{
	if (hh.tool != 'user' && ca.contains(hh.target))
	{
		if (event.target.nodeName.toUpperCase() == 'INPUT' || event.target.closest('button') || event.target.closest('A'))
		{
			event.preventDefault();
			event.stopPropagation();
		}
		return;
	}

	/*if (hh.target.id=='burger_menu')
	{
		document.querySelector('#burger').classList.remove('display');
	}
	else if (hh.target.closest('#burger_menu') && hh.target.closest('.onClickCloseBurgerMenu')) 
	{
		setTimeout(()=>document.querySelector('#burger').classList.remove('display'), 150);
	}*/

	if (hh.target.closest('.onClickCloseBurgerMenu')) 
	{
		setTimeout(()=>document.querySelector('#burger').classList.remove('display'), 100);
	}
	
	/* Cleaned up the toolbar just fine. This is another function that would really benefit from a whitelist style, and also a 'this' or my() function wrapping on hh.target.closest. I'm seeing the same things here. */
	
	if (hh.target.closest('.onClickCloseThisWindow'))
	{
		var w = event.target.closest('#contentarea .container.window');
		if (w) {
			var gu = cag.contains(w);
			
			w.style.transition = "transform 0.5s, opacity 0.5s, width 0.25s 0.5s, min-width 0.25s 0.5s";
			w.style.transformOrigin = "top right";
			w.style.transform = "scale(0.0)";
			w.style.opacity = "0";
			setTimeout(()=>{ 
				(gu ? gutter_virtual_dom : content_virtual_dom).BeginUndoableMutations();
				w.parentNode.removeChild(w);
				(gu ? gutter_virtual_dom : content_virtual_dom).FinishUndoableMutations(true);
			},250);
		}
	}
	else if (hh.target.closest('.onClickBeep'))
	{
		beep();
	}
	else if (hh.target.closest('.onClickGoBack'))
	{
		history.back();
	}
	else if (hh.target.closest('.onClickShowModalDialog'))
	{
		// if nothing's selected, this should affect the current selection. Allow it to be edited, etc.
		// the modal dialog should have folding triangles and a 'go up to parent' button. 

		var selected = catd.querySelectorAll('.gutter.selected:not(svg), svg.gutter path.selected'), sel = selected[0];
		if (sel && hh.tool == 'type')
			show_modal_dialog(sel);
		else {
			// where's the text selection? Adopt what you have
			sel = hh.wgsr && hh.wgsr.commonAncestorContainer;
			if (sel && !sel.closest)
				sel = sel.parentNode;
			if (sel && sel.closest && (sel=sel.closest('.gutter:not(svg), svg.gutter path')))
			{
				selected.forEach((s)=>s.classList.remove('selected'));
				sel.classList.add('selected');
				show_modal_dialog(sel);
			}
			else if (hh.wgsr)
			{
				// very cool but needs support when Save Changes is clicked
				
				var span = document.createElement('SPAN');
				//hh.wgsr.surroundContents(span);
				//hh.wgsr.insertNode(span);
				span.appendChild(hh.wgsr.cloneContents());
				if (span.childNodes.length==0) span.appendChild(document.createTextNode(''));
				//show_modal_dialog(span);	
				// the above is buggy because it doesn't have any place to store, and I don't want to go breaking undo willy nully
				// the following is cool! but the dialog needs an entry point scroll
				show_modal_dialog(contentareainner);	
}
			
		}
		
	}	
	else if (hh.target.closest('.onClickDecTarget'))
	{
		var btn = event.target.closest('.toolbar_tr button'), id = btn&&btn.id, param; 
		if (id && id.substr(0,4)=='dec_' && (id=id.substr(4))) { 
			if (id=='createLink') {
				var wgs = window.getSelection(), 
					a = (wgs.anchorNode && wgs.anchorNode.parentNode.closest('a[href]')) || (wgs.focusNode && wgs.focusNode.parentNode.closest('a[href]'));
				var base = document.baseURI.split('/').slice(0,-1).join('/') + '/';
				var href = a && (a.href.startsWith(base) ? a.href.slice(base.length) : a.href);
				if (!(param=prompt('https://example.com/page\nmy-own-file\nuser/person/page',
					href || String(wgs) || ''))) return; 
			}
			if (id=='fontsize') if (param=prompt('size 1–7:',document.queryCommandValue('fontsize'))) {} else return;
			if (id=='insertimage') if (param=prompt('Image:','bill.png')) param = 'images.folder/'+param; else return;
			if (id=='superscriptsubscript') id = (document.queryCommandState('superscript') || document.queryCommandState('subscript')) ? 'subscript' : 'superscript';
			if (id=='undoredo') id = (hh.state.shift ? 'redo' : 'undo');
			document.execCommand(id,false,param); 
			hh_selection_properties(); 
			}
		//console.log(event.target, btn,id,param);	
	}
	else if (hh.target.closest('.onClickNewBlankFile'))
	{
		var now = '$'+ new Date().toUTCString().replaceAll(/[.]/g,'-').replaceAll(/[ ]/g,''); //Date.now();
		var packet = {}; 
		packet[now] = { 
			changes: {
				content: { _: [ { tag: 'DIV', _: [{tag: 'BR',_:[]}] }] },
				gutter: { _: [] }
				}/*,
			state: { 
				sel: {anchor: [], anchorOffset: 0, focus: [], focusOffset: 0}
			}*/
		};
		receive_files(packet);
		hh_go_to_page(now); 
		if (hh.tool == 'user') hh_set_tool('type'); 
		cai.focus();
	}
	else if (hh.target.closest('.onClickPrint'))
	{
		window.print();
	}	
	else if (hh.target.closest('.onClickReload'))
	{
		window.location.reload();
	}	
	else if (hh.target.closest('.onClickClearLocalStorage'))
	{
		if (!hh.connected || confirm("Clear all locally stored data?"))
		{
			localStorage.clear();
			window.onbeforeunload = null;
			
			if (navigator.serviceWorker) 
			{
				window.caches.keys().then(cachesToDelete => {
					return Promise.all(cachesToDelete.map(cacheToDelete => {
						return window.caches.delete(cacheToDelete);
					}));
				});
				navigator.serviceWorker.getRegistrations().then(registrations => { if (registrations[0]) registrations[0].unregister(); });
			}
			
			var stay_logged_in;
			if (hh.connected && hh.username)
			{
				if (hh.username=='Guest' || confirm("Log out of account ‘" + hh.username + '’?'))
				{
					document.cookie="sessionname=;expires=0;path=/";
					document.cookie="username=;expires=0;path=/";
				}
				else 
				{
					localStorage.setItem('allow_cookies','true'); 	// stay logged in with cookies obviously
					stay_logged_in = true;
				}
			}
			
			
			var fixey = document.createElement('div');
			fixey.innerHTML = "<div style='position: fixed; left: 1em; bottom: 1em; background: var(--yellow); color: black; border-radius: 0.5em; padding: 0.5em; font-weight: bold; z-index: 1000;'>Data deleted. Reloading...</div>";
			document.body.appendChild(fixey);
			if (hh.connected && !stay_logged_in && hh.url.user == hh.username)
				setTimeout(()=>(location.href='.'), 1000);
			else
				setTimeout(()=>window.location.reload(true), 100);
			
			hh.username = null;
		}
	}	
	else if (hh.target.closest('.onClickUploadAll'))
	{
		hh_upload();
	}
	else if (hh.target.closest('.onClickUploadOne'))
	{
		hh_upload(hh.target.closest('[data-filename]').getAttribute('data-filename'));
	}
	else if (hh.target.closest('.onClickAboutThisApp'))
	{
		beep(); 
		setTimeout(()=>{
			alert('Hyperhello.com\n©2020 by HyperVariety Custom Software\n\nWelcome to Hyperhello.');
			},100);
	}
	else if (hh.target.closest('.onClickGoToFile'))
	{
		var dfn = hh.target.closest('[data-filename]');
		if (dfn) {
			var href = dfn.getAttribute('data-filename');
			var Alink = dfn.querySelector('A');
			if (href != hh.url.href) {
				hh_go_to_page(href);
				return event.preventDefault();				
			}
			else if (Alink !== document.activeElement)
			{
				return event.preventDefault();
			}
		}
	}
	else if (hh.target.closest('A'))	// give the others the chance to go first
	{
		var element=hh.target.closest('A');
		if (!hh.state.meta && element.href)
			return hh_go_to_page(element.href) ? event.preventDefault() : null;
	}
	

}

function create_hover_activity()
{
	/*if (!hh.target.closest('#burger'))
	{
		// this isn't in the right place, so it doesn't work. need to revamp hover so burger menu can grab it ala pointerevents spec
		document.querySelector('#burger').classList.remove('display');
	}*/

	if (hh.tool == 'type')
	{
	}
	else if (hh.tool == 'paint')
	{
		return function (finish)
		{
			// the cursor lives in the translated fixed space
			document.getElementById('contentareacursor').style.left = (hh.state.fixed[0])-14+'px';
			document.getElementById('contentareacursor').style.top = (hh.state.fixed[1])-15+'px';
			//document.getElementById('contentareacursor').style.left = (hh.state.content[0])-14+'px';
			//document.getElementById('contentareacursor').style.top = (hh.state.content[1])-15+'px';
			if (hh.target && hh.target.closest)
				document.getElementById('contentareacursor').classList.toggle('hidden', 
					finish 
					|| (!hh.target.closest('#paint, #swatch, #contentareapaintoverlay') 
					/*&& !pt_inside_rect(hh.state.fixed, clientRect(document.getElementById('contentareapaintoverlay')))*/));
		}
 	}
	else 
	{
		//put('');
	}
}

function create_keydown_activity(event)
{
	if (has_modal_dialog())
	{
		if (hh.state.meta && event.keyCode == 13)	// meta-return
		{
			hide_modal_dialog(true);
			return event.preventDefault();
		}
		else if (hh.state.keyCode == 27 && !hh.pressed_activity && document.querySelector('#modal').contains(document.activeElement))
		{
			hide_modal_dialog(false);
			return event.preventDefault();
		}
	}
	
	if (hh.state.meta || hh.state.ctrl)
	{
		var cmd = ({ 66: 'bold', 73: 'italic', 85: 'underline', 83: 'strikethrough' })[hh.state.keyCode];
		if (cmd && (hh.tool == 'paint' || hh.tool == 'type'))
		{
			// I LIKE these shortcuts, they shouldn't be hidden behind bookmark, info, save, etc
			document.execCommand(cmd);
			return event.preventDefault();
		}
		return;
	}
	
	if (hh.state.keyCode == 27)	// ESC
	{
		if (hh.pressed_activity)
		{
			hh.pressed_activity('cancel');
			hh.pressed_activity = null;	// what about hover?
		}
		else if (!document.getElementById('burger').contains(document.activeElement))
		{
			if (document.getElementById('burger').classList.contains('display'))
			{
				document.getElementById('burger').classList.remove('display');
			}
			else
			{
				var gutters = catd.querySelectorAll('.gutter.selected');
				if (hh.tool == 'type')
				{
					for (var i = gutters.length-1; i >= 0; i--)
					{
						gutters[i].classList.remove("selected");
					}
				}
				
				if (!(hh.tool == 'type' && gutters.length))
				{
					if (hh.last_keydown_state && hh.last_keydown_state.time > hh.state.time-500 && hh.last_keydown_state.keyCode == 27)
						hh_set_tool(hh.last_keydown_state.tool == 'paint' ? 'user' : 'paint');
					else
						hh_set_tool(hh.tool == 'type' ? 'user' : 'type');
				}
			}
		}

		return event.preventDefault();
	}

	if (has_modal_overlay())
	{
	}
	else if (hh.state.keyCode == 13)	// RETURN
	{
		document.execCommand('insertLineBreak')	// that was easy
		return event.preventDefault();
	}
	else if (hh.state.keyCode == 8)	// DELETE
	{
		/*document.execCommand('delete')	// that was easy
		return event.preventDefault();*/
		// amazingly, on safari the entire delete is found to be undoable! (update: doesnt seem to work anymore)
		var svgs = [], any_found;
		[cai,cag].forEach((zone)=>
		{
			var gutters = zone.querySelectorAll('.gutter.selected, svg.gutter path.selected');
			if (gutters.length)
			{
				(zone===cai ? content_virtual_dom : gutter_virtual_dom).BeginUndoableMutations(); 	// ugly. make gutter/content a template.
				for (var i = gutters.length-1; i >= 0; i--)
				{
					var svgparent = gutters[i].closest('svg');
					if (svgparent && svgs.indexOf(svgparent)==-1) svgs.push(svgparent);
					gutters[i].parentNode.removeChild(gutters[i]);
				}
				(zone===cai ? content_virtual_dom : gutter_virtual_dom).FinishUndoableMutations(true);
				any_found = true;
			}
		});
		svgs.forEach(gutter_float_shape_outside);
		if (any_found)
			return event.preventDefault();
	}
	else
	{
		[cai,cag].forEach((zone)=>
			{ zone.querySelectorAll('.gutter.selected, svg.gutter path.selected').forEach((e)=>e.classList.remove('selected')); }
		);
	}
	
}
					