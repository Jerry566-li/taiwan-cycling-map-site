(() => {
  const root = document.getElementById("taiwan-cycle-nov26");
  if (!root) return;
  const q = (key) => root.querySelector("[data-" + key + "]");
  const data = window.taiwanCyclingData || JSON.parse(q("map-json").textContent);
  const svgNode = root.querySelector(".tw-map svg");
  const d3 = window.d3;
  const controls = { region: q("region"), suhua: q("suhua"), east: q("east") };
  const storageKey = "taiwan-cycling-map-preferences";
  const colors = { bike:"var(--track-bike)", rail:"var(--track-rail)", alt:"var(--track-alt)", closed:"var(--track-closed)", check:"var(--track-check)" };
  const regionNames = { all:"环岛总览", north:"台北 → 福隆 → 苏澳", suhua:"苏花公路", cliff:"清水断崖", east:"花莲 → 台东", south:"台东 → 垦丁 → 枋寮", west:"西岸" };
  const views = {
    all:[[119.94,21.85],[122.18,25.17]], north:[[121.45,24.54],[122.08,25.17]],
    suhua:[[121.51,23.94],[122.02,24.64]], cliff:[[121.59,24.105],[121.745,24.26]],
    east:[[121.06,22.71],[121.85,24.04]], south:[[120.54,21.87],[121.25,22.85]],
    west:[[119.96,21.86],[121.70,25.10]]
  };
  const overview = {
    all: ["顺时针 · 从台北回到台北", "东岸与南端以骑行为主，西岸用台铁串接可选短骑。切换区域可看具体路段、车站与公里数。"],
    north: ["东北角 · 福隆与旧草岭", "台北经河谷前往福隆，穿旧草岭自行车隧道后进入东北角海岸及宜兰平原。"],
    suhua: ["苏花 · 沿海山路和隧道交替", "骑行主线混用保留的台9丁、普通台9和允许自行车的仁水隧道。线路是否放行取决于当天路况。"],
    cliff: ["清水断崖 · 崇德隧道北口", "崇德观景区可看断崖，汇德步道封闭。由南往观景区要穿崇德隧道；想避开该隧道，可选南侧崇德砾滩远眺。"],
    east: ["花东 · 海岸、纵谷或混合", "台9看山脉、稻田与乡村，台11看太平洋和海蚀地形。混合线经玉长公路翻越海岸山脉。"],
    south: ["南回 · 台东到恒春半岛", "走台9戊经寿卡，绕开自行车禁行的草埔森永隧道。枫港到垦丁约35公里单程，骑到鹅銮鼻约43公里单程。按图原路折返枫港后，再北上枋寮站。恒春半岛留意落山风。"],
    west: ["西岸 · 台铁北上", "蓝线为可分段搭乘的台铁路廊。通霄到白沙屯在铁路海线；竹南到香山在海线、山线汇合后的区段。紫线为可插入行程的骑行段。"]
  };
  const suhuaText = {
    full:"A 全骑走台9丁的三个旧路段，经普通台9衔接，和仁至大清水走仁水隧道。",
    partial:"B 先骑苏澳到东澳的旧路，在东澳站上车；崇德站下车，班次或名额不合时改新城站。",
    rail:"C 苏澳新站上车，新城站下车；看断崖需北上折返，也可查崇德下车的携车班次。"
  };
  const eastNames = {valley:"台9纵谷",coast:"台11海岸",hybrid:"海岸＋玉长＋纵谷"};
  const points = data.points;
  const allRoutes = data.segments;
  let selected = "";
  let view = controls.region.value;
  let visibleRoutes = [];
  let visiblePoints = [];
  let frameSize = [0,0];
  let drawingFrame = 0;
  const zoomMaximum = 16;
  const zoom = d3?.zoom()
    .extent(() => [[0,0],frameSize])
    .scaleExtent([1,zoomMaximum])
    .clickDistance(5)
    .duration(0)
    .on("zoom",scheduleDraw);
  const fmt = km => Number.isFinite(km) ? "约 " + (km < 10 ? Number(km.toFixed(1)) : Math.round(km)) + " 公里" : "";
  const src = (href, label) => ({ href, label });
  const generalSources = {
    suhua:[src("https://thbu4.thb.gov.tw/cp.aspx?n=5214","公路局新旧路网"),src("https://www.thb.gov.tw/News_Content_table.aspx?n=87&s=60481","仁水隧道车种"),src("https://taiwanbike.tw/map/Home/QA","环岛1号线接驳")],
    cliff:[src("https://www.taroko.gov.tw/ch/listicle/faq/404","崇德观景区"),src("https://www.taroko.gov.tw/ch/trailsAttractions/trail-list","步道开放")],
    south:[src("https://www.thb.gov.tw/News_Content.aspx?n=87&s=60588","公路局南回通行"),src("https://south.cwa.gov.tw/inner/imow1572429930vFJC","气象署落山风")],
    west:[src("https://www.trc.com.tw/tra-tip-web/tip/tip00D/tipD11/goBikeStation","两铁车站清单")],
    all:[src("https://www.tad.gov.tw/m1.aspx?sNo=0042293","交通部自行车旅游")]
  };
  function restore(snapshot) {
    const state = snapshot?.modelContent || snapshot;
    if (!state) return;
    for (const key of Object.keys(controls)) {
      if (Array.from(controls[key].options).some(option => option.value === state[key])) controls[key].value = state[key];
    }
    selected = snapshot?.privateContent?.selected || "";
  }
  function save() {
    const modelContent = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value]));
    try {
      localStorage.setItem(storageKey,JSON.stringify({modelContent,privateContent:{selected}}));
    } catch {
      // 隐私模式或禁用存储时，当前页面仍可正常使用。
    }
  }
  function regionIncludes(item) {
    return view === "all" ? !item.noOverview : item.regions.includes(view);
  }
  function active(route) {
    if (route.suhua && !route.suhua.includes(controls.suhua.value)) return false;
    const east = controls.east.value;
    if (route.east && east !== "compare" && !route.east.includes(east)) return false;
    return true;
  }
  function paintType(route) {
    if (route.kind === "alt" && route.east && controls.east.value !== "compare") return "bike";
    return route.kind;
  }
  function option(value, name) {
    const element = document.createElement("option");
    element.value = value; element.textContent = name;
    return element;
  }
  function sum(routes) {
    return routes.filter(route => Number.isFinite(route.km)).reduce((km,route)=>km+route.km,0);
  }
  function primarySuhua(mode) {
    return allRoutes.filter(route => route.regions.includes("suhua") && route.kind === mode && active(route) && route.main !== false);
  }
  function detail() {
    const item = [...visibleRoutes,...visiblePoints].find(value => value.id === selected);
    let heading, note, links;
    if (item) {
      heading = item.name + (Number.isFinite(item.km) ? " · " + fmt(item.km) : "");
      note = item.note || "";
      links = item.links || [];
    } else {
      [heading,note] = overview[view];
      if (view === "suhua" || view === "cliff") {
        note += " " + suhuaText[controls.suhua.value];
        if (view === "suhua") {
          const rideKm = sum(primarySuhua("bike"));
          const railKm = sum(primarySuhua("rail"));
          if (rideKm) note += " 骑行主线" + fmt(rideKm) + (railKm ? "，铁路" + fmt(railKm) : "") + "；看断崖折返另列。";
        }
      }
      if (view === "east") {
        const summaries = Object.entries(eastNames).map(([key,name]) => {
          const km = sum(allRoutes.filter(route => route.east?.includes(key) && route.main !== false));
          return km ? name+" "+fmt(km) : null;
        }).filter(Boolean);
        if (summaries.length) note += " " + summaries.join("，") + "。";
      }
      links = generalSources[view] || [];
    }
    q("detail-title").textContent = heading;
    q("detail-note").textContent = note;
    q("detail-links").replaceChildren(...links.map(({href,label}) => {
      const a = document.createElement("a");
      a.href=href; a.textContent=label; a.target="_blank"; a.rel="noopener";
      return a;
    }));
  }
  function changeSelection(id) {
    selected = id;
    q("inspect").value = id;
    detail(); draw(); save();
  }
  function refresh() {
    const previousView = view;
    view = controls.region.value;
    if (zoom && previousView !== view) d3.select(svgNode).call(zoom.transform,d3.zoomIdentity);
    visibleRoutes = allRoutes.filter(regionIncludes);
    visiblePoints = points.filter(regionIncludes);
    q("suhua-control").hidden = !["all","suhua","cliff"].includes(view);
    q("east-control").hidden = !["all","east"].includes(view);
    if (![...visibleRoutes,...visiblePoints].some(item => item.id === selected)) selected = "";
    q("inspect").replaceChildren(option("",regionNames[view] + " · 方案概况"),
      ...visibleRoutes.filter(route => route.inspect !== false).map(route => option(route.id,route.name+(Number.isFinite(route.km) ? " · "+fmt(route.km) : ""))),
      ...visiblePoints.map(point => option(point.id,point.name)));
    q("inspect").value = selected;
    q("distances").replaceChildren(...visibleRoutes.filter(route => Number.isFinite(route.km) && route.showDistance !== false && active(route)).map(route => {
      const row = document.createElement("li");
      row.textContent = route.name + " · " + fmt(route.km) + (route.kind === "rail" ? "（铁路）" : "");
      return row;
    }));
    detail(); draw();
  }
  function scheduleDraw() {
    if (!drawingFrame) drawingFrame = requestAnimationFrame(() => {
      drawingFrame = 0;
      draw();
    });
  }
  function changeZoom(factor) {
    if (zoom) d3.select(svgNode).call(zoom.scaleBy,factor);
  }
  function resetZoom() {
    if (zoom) d3.select(svgNode).call(zoom.transform,d3.zoomIdentity);
  }
  function updateZoomControls(transform) {
    q("zoom-in").disabled = transform.k >= zoomMaximum - .001;
    q("zoom-out").disabled = transform.k <= 1.001;
    q("zoom-reset").disabled = transform.k <= 1.001 && Math.abs(transform.x) + Math.abs(transform.y) < 1;
  }
  function draw() {
    if (!d3) {
      svgNode.replaceChildren();
      svgNode.setAttribute("height", "60");
      const message = document.createElementNS("http://www.w3.org/2000/svg","text");
      message.setAttribute("x","12"); message.setAttribute("y","28");
      message.textContent = "地图绘图组件加载失败，可用下方选择器查看分段资料。";
      svgNode.append(message);
      return;
    }
    const {geoMercator,geoPath,select,zoomTransform} = d3;
    const width = Math.max(280,Math.round(svgNode.getBoundingClientRect().width));
    const height = view === "cliff" ? (width < 450 ? 400 : 460) : (width < 450 ? 535 : 610);
    const margin = width < 450 ? 24 : 37;
    const fit = [[margin,25],[width-margin,height-23]];
    const projection = geoMercator().fitExtent(fit,{type:"MultiPoint",coordinates:views[view]});
    const islandScale = geoMercator().fitExtent(fit,{type:"MultiPoint",coordinates:views.all}).scale();
    const [mapLeft,mapBottom] = projection(views.all[0]);
    const [mapRight,mapTop] = projection(views.all[1]);
    zoom.translateExtent([[Math.min(0,mapLeft),Math.min(0,mapTop)],[Math.max(width,mapRight),Math.max(height,mapBottom)]]);
    let transform = zoomTransform(svgNode);
    if (frameSize[0] && (frameSize[0] !== width || frameSize[1] !== height) && transform.k > 1) {
      const x = (width-frameSize[0])*(1-transform.k)/2 + transform.x;
      const y = (height-frameSize[1])*(1-transform.k)/2 + transform.y;
      transform = d3.zoomIdentity.translate(x,y).scale(transform.k);
      svgNode.__zoom = transform;
    }
    frameSize = [width,height];
    projection.scale(projection.scale()*transform.k).translate(transform.apply(projection.translate()))
      .clipExtent([[0,0],frameSize]);
    const detailZoom = projection.scale()/islandScale;
    const path = geoPath(projection).digits(1);
    updateZoomControls(transform);
    const svg = select(svgNode).attr("viewBox",[0,0,width,height]).attr("height",height);
    svg.selectAll("*").remove();
    svg.append("title").text(regionNames[view] + "的骑行、铁路和景点");
    svg.append("rect").attr("width",width).attr("height",height).attr("fill","color-mix(in srgb, var(--track-rail) 8%, var(--background))");
    svg.append("g").selectAll("path").data(data.land.features).join("path").attr("d",path)
      .attr("fill","color-mix(in srgb, var(--track-bike) 8%, var(--background))").attr("stroke","var(--border)").attr("stroke-width",.8);
    const guide = svg.append("g").attr("fill","none").attr("stroke","var(--border)").attr("stroke-width",.8);
    const backgroundRoads = (data.basemap?.roads || []).filter(road => detailZoom >= road.minZoom);
    for (const road of backgroundRoads) {
      const line = path({type:"MultiLineString",coordinates:road.lines});
      if (line) guide.append("path").attr("d",line).attr("stroke","var(--muted-foreground)")
        .attr("opacity",detailZoom > 2 ? .30 : .22).attr("stroke-width",detailZoom > 4 ? 1.25 : .9);
    }
    const cities = (data.basemap?.cities || [])
      .filter(city => detailZoom >= city.minZoom)
      .map(city => ({...city, position:projection(city.coord)}))
      .filter(({position:[x,y]}) => x > 7 && x < width-7 && y > 9 && y < height-20);
    for (const {position:[x,y]} of cities) {
      guide.append("circle").attr("cx",x).attr("cy",y).attr("r",2.1)
        .attr("fill","var(--muted-foreground)").attr("stroke","none").attr("opacity",.78);
    }
    const zoomedSuhua = view === "suhua" || view === "cliff";
    const order = {closed:0,rail:1,alt:2,bike:3};
    const sorted = [...visibleRoutes].sort((a,b) => (active(a)-active(b)) || (order[paintType(a)]-order[paintType(b)]));
    const routeLayer = svg.append("g").attr("fill","none").attr("stroke-linecap","round").attr("stroke-linejoin","round");
    for (const route of sorted) {
      if (!route.lines?.length) continue;
      const type = paintType(route);
      const isActive = active(route);
      if (!isActive && (route.kind === "rail" || (view === "all" && route.suhua))) continue;
      const d = path({type:"MultiLineString",coordinates:route.lines});
      if (!d) continue;
      const group = routeLayer.append("g");
      const strokeWidth = route.id === selected ? 6 : (type === "closed" ? 2.8 : (type === "rail" ? 3.6 : 4.1));
      if (isActive) group.append("path").attr("d",d).attr("stroke","var(--background)").attr("stroke-width",strokeWidth+2.5).attr("opacity",.85);
      const candidateDash = route.east?.includes("coast") ? "2 4" : route.east?.includes("valley") ? "8 4" : "8 3 2 3";
      group.append("path").attr("d",d).attr("stroke",!isActive && route.east ? colors.alt : colors[type])
        .attr("stroke-width",isActive ? strokeWidth : 1.8)
        .attr("stroke-dasharray",type === "rail" ? "7 5" : type === "closed" ? "3 4" : type === "alt" || !isActive ? candidateDash : null)
        .attr("opacity",isActive ? 1 : .37);
      group.append("path").attr("d",d).attr("stroke","transparent").attr("stroke-width",15)
        .attr("class","cursor-interaction").attr("data-tooltip",route.name + (Number.isFinite(route.km) ? " · "+fmt(route.km) : ""))
        .on("click",() => changeSelection(route.id));
    }
    const labelEntries = [];
    const marks = svg.append("g");
    for (const point of visiblePoints) {
      if (point.suhua && !point.suhua.includes(controls.suhua.value)) continue;
      const [x,y] = projection(point.coord);
      if (x < 4 || x > width-4 || y < 4 || y > height-4) continue;
      const station = point.kind === "station";
      const blocked = point.kind === "closed";
      const caution = point.kind === "check";
      const railRole = point.roles?.[controls.suhua.value];
      const label = railRole && zoomedSuhua ? point.name + " · " + railRole : (point.short || point.name);
      const g = marks.append("g").attr("class","cursor-interaction").on("click",() => changeSelection(point.id))
        .attr("data-tooltip",label);
      g.append("circle").attr("cx",x).attr("cy",y).attr("r",11).attr("fill","transparent");
      if (station) {
        const r = railRole && zoomedSuhua ? 5.2 : 3.8;
        g.append("rect").attr("x",x-r).attr("y",y-r).attr("width",2*r).attr("height",2*r)
          .attr("fill",colors.rail).attr("stroke","var(--background)").attr("stroke-width",1.2);
      } else {
        g.append("circle").attr("cx",x).attr("cy",y).attr("r",point.id === selected ? 6 : 4.2)
          .attr("fill",caution ? "var(--background)" : blocked ? colors.closed : "var(--foreground)")
          .attr("stroke",caution ? colors.check : "var(--background)").attr("stroke-width",caution ? 2.4 : 1.3);
      }
      if (point.labels?.includes(view) || point.id === selected || (railRole && zoomedSuhua)) {
        labelEntries.push({x,y,label,side:point.side,offset:point.offset || 0,priority:railRole ? 3 : point.priority || 1,id:point.id});
      }
    }
    for (const route of sorted) {
      if (!active(route) || !Number.isFinite(route.km) || !route.badge?.includes(view) || !route.lines?.length) continue;
      const line = route.lines.reduce((longest,next) => next.length > longest.length ? next : longest,[]);
      const coord = route.labelAt || line[Math.floor(line.length/2)];
      if (!coord) continue;
      const [x,y] = projection(coord);
      if (x < 8 || x > width-8 || y < 11 || y > height-11) continue;
      labelEntries.push({x,y,label:(route.shortLabel ? route.shortLabel + " " : "") + fmt(route.km),side:route.badgeSide || "left",offset:0,priority:0,id:route.id});
    }
    const cart = svg.append("g");
    const markText = (x,y,copy,cls="") => cart.append("text").attr("x",x).attr("y",y).attr("class",cls).text(copy);
    markText(13,20,"↑ 北","minor-label");
    if (width >= 500 && transform.k < 1.3) {
      const sea = markText(width-82,46,"太平洋","water-label");
      sea.attr("text-anchor","middle");
    }
    const bands = {left:[],right:[]};
    for (const entry of labelEntries) {
      const side = entry.side || (entry.x > width*.57 ? "left" : "right");
      bands[side].push({...entry,target:entry.y+entry.offset});
    }
    for (const [side,entries] of Object.entries(bands)) {
      entries.sort((a,b)=>a.target-b.target || b.priority-a.priority);
      let last = 22;
      const delta = width < 400 ? 15 : 17;
      for (const entry of entries) { entry.row = Math.max(entry.target,last+delta); last = entry.row; }
      let edge = height-8;
      for (const entry of entries.slice().reverse()) { entry.row = Math.min(entry.row,edge); edge = entry.row-delta; }
      for (const entry of entries) {
        const d = side === "left" ? -1 : 1;
        const tx = entry.x + d*(Math.abs(entry.y-entry.row)>6 ? 17 : 8);
        const text = markText(tx,entry.row+4,entry.label,entry.priority === 0 ? "minor-label" : "");
        text.attr("text-anchor",side==="left" ? "end" : "start").classed("cursor-interaction",true)
          .on("click",()=>changeSelection(entry.id));
        const box = text.node().getBBox();
        const shift = box.x < 5 ? 5-box.x : box.x+box.width > width-5 ? width-5-box.x-box.width : 0;
        if (shift) text.attr("x",tx+shift);
        if (Math.abs(entry.y-entry.row)>6) {
          cart.insert("line","text").attr("x1",entry.x+d*4).attr("y1",entry.y).attr("x2",tx+shift-d*2).attr("y2",entry.row)
            .attr("stroke","var(--muted-foreground)").attr("stroke-opacity",.55).attr("stroke-width",.8);
        }
      }
    }
    const lat = projection.invert([width/2,height/2])[1];
    const pxPerKm = Math.abs(projection([121+1/(111.2*Math.cos(lat*Math.PI/180)),lat])[0]-projection([121,lat])[0]);
    const niceSteps = [.1,.2,.5,1,2,5,10,20,50,100];
    const scaleKm = niceSteps.filter(km => km * pxPerKm <= 88).pop() || niceSteps[0];
    const scale = scaleKm * pxPerKm;
    cart.append("path").attr("d","M12,"+(height-14)+"h"+scale).attr("stroke","var(--muted-foreground)").attr("stroke-width",1.6);
    markText(12,height-20,scaleKm+" km","minor-label");

    // 地名和公路编号放在路线标签之后，避让已占用的空间。
    const occupied = cart.selectAll("text").nodes().map(node => node.getBBox());
    occupied.push({x:width-183,y:height-87,width:183,height:87});
    function labelContext([x,y],label,road = false) {
      if (x < 10 || x > width-10 || y < 25 || y > height-14) return;
      for (const direction of [1,-1]) {
        const text = markText(x+direction*5,y+(road ? -3 : 4),label,"context-label")
          .attr("text-anchor",direction > 0 ? "start" : "end").classed("context-ref",road);
        const box = text.node().getBBox();
        if (box.x > 4 && box.x+box.width < width-4 && occupied.every(other =>
          box.x+box.width+5 < other.x || other.x+other.width+5 < box.x ||
          box.y+box.height+3 < other.y || other.y+other.height+3 < box.y)) {
          occupied.push(box);
          return;
        }
        text.remove();
      }
    }
    for (const city of cities) labelContext(city.position,city.name);
    for (const road of backgroundRoads) {
      if (detailZoom < road.labelZoom) continue;
      for (const coord of road.labels || []) labelContext(projection(coord),road.ref,true);
    }
  }
  if (zoom) {
    d3.select(svgNode).call(zoom);
    q("zoom-in").addEventListener("click",()=>changeZoom(1.5));
    q("zoom-out").addEventListener("click",()=>changeZoom(1/1.5));
    q("zoom-reset").addEventListener("click",resetZoom);
    q("map-panel").addEventListener("keydown",event => {
      const pan = {ArrowLeft:[42,0],ArrowRight:[-42,0],ArrowUp:[0,42],ArrowDown:[0,-42]}[event.key];
      if (pan) {
        const k = d3.zoomTransform(svgNode).k;
        d3.select(svgNode).call(zoom.translateBy,pan[0]/k,pan[1]/k);
      } else if (event.key === "+" || event.key === "=") changeZoom(1.5);
      else if (event.key === "-") changeZoom(1/1.5);
      else if (event.key === "0") resetZoom();
      else return;
      event.preventDefault();
    });
  }
  try {
    restore(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    // 首次打开或旧数据损坏时使用默认方案。
  }
  for (const control of Object.values(controls)) {
    control.addEventListener("change",()=>{ selected=""; refresh(); save(); });
  }
  q("inspect").addEventListener("change",event=>changeSelection(event.target.value));
  new ResizeObserver(scheduleDraw).observe(root.querySelector(".tw-map"));
  refresh();
})();
