/* In-browser API for the downloadable, server-free QuoteLine HTML. */
(() => {
  const originalFetch = window.fetch.bind(window);
  const nameMap = {
    description:['description','item description','product','material','item','details','scope','work description'],
    code:['code','sku','product code','item code','part number','part no','ref','reference'],
    qty:['qty','quantity','units'], unit:['unit','uom','measure'],
    unit_price:['unit price','unit rate','rate','price each','each','unit cost','price'],
    total:['line total','amount','extended price','total','value']
  };
  const clean = x => String(x ?? '').replace(/\s+/g,' ').trim();
  const number = x => {
    if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x*100)/100 : null;
    const s=clean(x).replace(/[$£€,]/g,'').replace(/^\((.*)\)$/,'-$1');
    return /^-?\d+(\.\d+)?$/.test(s) ? Math.round(Number(s)*100)/100 : null;
  };
  const norm = x => clean(x).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const totalWord = /^(sub\s*total|total|gst|vat|tax|freight|delivery|shipping|discount|deposit|balance|page\s+\d+)/i;
  function item(description,qty,unitPrice,total,code='',unit='ea',source='') {
    description=clean(description);if(!description||totalWord.test(description))return null;
    qty=number(qty);unitPrice=number(unitPrice);total=number(total);
    if(qty==null||qty<=0)qty=(unitPrice!=null||total!=null)?1:null;
    if(qty==null)return null;
    if(unitPrice==null&&total!=null)unitPrice=Math.round(total/qty*100)/100;
    if(unitPrice==null||unitPrice<0)return null;
    code=clean(code).toUpperCase();
    if(!code){const match=description.match(/\b(?=[A-Z0-9-]{4,}\b)(?=[A-Z0-9-]*\d)[A-Z][A-Z0-9-]*\b/i);code=match?match[0].toUpperCase():''}
    return {description,code,qty,unit:clean(unit)||'ea',unit_price:unitPrice,total:Math.round(qty*unitPrice*100)/100,source,price_warning:total!=null&&Math.abs(total-qty*unitPrice)>0.02};
  }
  function headerMap(cells){
    const lower=cells.map(x=>norm(x));const result={};
    for(const [field,names] of Object.entries(nameMap)){
      const i=lower.findIndex(x=>names.includes(x));if(i>=0)result[field]=i;
    }
    return result.description!=null&&(result.unit_price!=null||result.total!=null)?result:null;
  }
  function rowsToItems(rows,source){
    let header=null,start=0;
    for(let i=0;i<Math.min(30,rows.length);i++){header=headerMap(rows[i]);if(header){start=i+1;break}}
    if(!header)return [];
    const out=[];
    for(let i=start;i<rows.length;i++){
      const v=k=>header[k]==null?'':rows[i][header[k]];
      const entry=item(v('description'),v('qty'),v('unit_price'),v('total'),v('code'),v('unit'),`${source} row ${i+1}`);
      if(entry)out.push(entry);
    }
    return out;
  }
  function textItems(text,source){
    const out=[];
    text.split(/\r?\n/).forEach((raw,i)=>{
      const line=clean(raw);if(!line||totalWord.test(line))return;
      const parts=raw.split(/\t|\s{2,}|\s*\|\s*/).map(clean).filter(Boolean);
      if(parts.length<3)return;
      const last=number(parts.at(-1)),prev=number(parts.at(-2)),qty=number(parts.at(-3));
      if(last==null||prev==null)return;
      let entry;
      if(parts.length>=4&&qty!=null)entry=item(parts.slice(0,-3).join(' '),qty,prev,last,'','ea',`${source} line ${i+1}`);
      else entry=item(parts.slice(0,-2).join(' '),prev,null,last,'','ea',`${source} line ${i+1}`);
      if(entry&&!entry.price_warning)out.push(entry);
    });
    return out;
  }
  function sheetRows(sheet){return XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});}
  function parsePdfLines(lines){
    const all=lines.join('\n'),meta={raw_text:all};let items=[];
    const amount='([\\d,]+(?:\\.\\d{1,2})?)';
    if(all.includes('Product No.')&&all.includes('GST Inc Total')&&/BENTONS/i.test(all)){
      for(const [key,pattern] of Object.entries({quote_number:/Quote No\s+(\d+)/i,quote_date:/Quote Date\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,expiry_date:/Expiry Date\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i})){
        const found=all.match(pattern);if(found)meta[key]=found[1];
      }
      const product=new RegExp('^\\s*(BB\\d+)\\s+(.+?)\\s+(EA|EACH|PC|PCS)\\s+'+amount+'\\s+'+amount+'\\s+'+amount+'\\s+'+amount+'\\s*$','i');
      lines.forEach((line,i)=>{
        const m=line.match(product);
        if(m){const entry=item(m[2],m[4],m[5],null,m[1],m[3],`PDF line ${i+1}`);if(entry){
          const details=[];for(const next of lines.slice(i+1)){const value=clean(next);if(/^\$[\d,.]+$/.test(value)||/^BB\d+/i.test(value)||value.startsWith('*Quotes'))break;if(value&&!['SNK1','TA1'].includes(value))details.push(value)}
          entry.full_description=[m[2],...details].join(' ');entry.inc_gst_unit=number(m[6]);entry.inc_gst_total=number(m[7]);items.push(entry)}}
        const gst=line.match(new RegExp('\\bGST\\s+(?!Ex|Inc).*?\\$'+amount,'i'));
        const total=line.match(new RegExp('GST Inc Total\\s+\\$'+amount,'i'));
        if(gst)meta.tax=number(gst[1]);if(total)meta.quoted_total=number(total[1]);
      });
      return {items,meta:{...meta,name:"Benton's",price_basis:'ex GST'}};
    }
    if(all.includes('Reece Australia Pty Ltd')&&all.includes('Document Total')){
      for(const [key,pattern] of Object.entries({quote_number:/Quote No\.\s+(\d+)/i,quote_date:/\bDate\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,expiry_date:/Quote Expiry Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i})){
        const found=all.match(pattern);if(found)meta[key]=found[1];
      }
      const product=new RegExp('^\\s*\\d+\\s+\\d+\\s+([A-Za-z0-9]+)\\s+-?\\s*(.+?)\\s+'+amount+'\\s+'+amount+'\\s+(EA|EACH|PC|PCS)\\s+'+amount+'\\s+'+amount+'\\s+'+amount+'\\s*$','i');
      const freight=new RegExp('Delivery Fee -.+?\\s+'+amount+'\\s+'+amount+'\\s+EA\\s+'+amount+'\\s+'+amount+'\\s+'+amount,'i');
      const total=new RegExp('Document Total\\s+'+amount+'\\s+'+amount+'\\s+'+amount,'i');
      lines.forEach((line,i)=>{
        const m=line.match(product);
        if(m){const entry=item(m[2],m[3],m[4],m[6],m[1],m[5],`PDF line ${i+1}`);if(entry){
          const details=[];for(const next of lines.slice(i+1)){const value=clean(next);if(value.startsWith('*')||/^\d+\s+/.test(value)||value.includes('Delivery Fee'))break;if(value)details.push(value)}
          entry.full_description=[m[2],...details].join(' ');entry.inc_gst_total=number(m[8]);items.push(entry)}}
        const ship=line.match(freight);if(ship)meta.freight=number(ship[3]);
        const sum=line.match(total);if(sum){meta.tax=number(sum[2]);meta.quoted_total=number(sum[3])}
      });
      return {items,meta:{...meta,name:'Reece',price_basis:'ex GST'}};
    }
    return {items:textItems(all,'PDF'),meta};
  }
  async function parseFile(file){
    const ext=file.name.split('.').pop().toLowerCase();let items=[],kind='quote',meta={};
    if(ext==='xlsx'||ext==='csv'){
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(ext==='csv')meta.raw_text=new TextDecoder().decode(bytes);
      const book=XLSX.read(bytes,{type:'array'});
      if(ext==='xlsx'&&book.SheetNames.includes('Supplier Comparison Sheet')){
        kind='baseline';const rows=sheetRows(book.Sheets['Supplier Comparison Sheet']);
        rows.slice(6).forEach((row,i)=>{const entry=item(row[0],row[1],row[2],null,'','ea',`Supplier Comparison Sheet row ${i+7}`);if(entry)items.push(entry)});
      } else {
        for(const name of book.SheetNames){items=rowsToItems(sheetRows(book.Sheets[name]),name);if(items.length)break}
      }
    } else if(ext==='pdf'){
      const bytes=new Uint8Array(await file.arrayBuffer());
      const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
      let lines=[];
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p),content=await page.getTextContent(),groups=[];
        for(const span of content.items){
          const y=span.transform?.[5] ?? 0,x=span.transform?.[4] ?? 0;
          let group=groups.find(g=>Math.abs(g.y-y)<2);
          if(!group){group={y,parts:[]};groups.push(group)}
          group.parts.push({x,text:span.str});
        }
        groups.sort((a,b)=>b.y-a.y);
        lines.push(...groups.map(g=>g.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join('  ')));
      }
      ({items,meta}=parsePdfLines(lines));
    } else if(ext==='docx'){
      const buffer=await file.arrayBuffer();
      const html=await mammoth.convertToHtml({arrayBuffer:buffer});
      const doc=new DOMParser().parseFromString(html.value,'text/html');
      for(const table of doc.querySelectorAll('table')){
        const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(cell=>cell.textContent));
        items=rowsToItems(rows,'Word table');if(items.length)break;
      }
      const result=await mammoth.extractRawText({arrayBuffer:buffer});meta.raw_text=result.value;
      if(!items.length)items=textItems(result.value,'Word');
    } else if(ext==='txt'){meta.raw_text=await file.text();items=textItems(meta.raw_text,'Text')}
    else throw Error('Supported files: XLSX, CSV, PDF, DOCX, TXT');
    return {name:meta.name||file.name.replace(/\.[^.]+$/,''),kind,items,...meta,warning:items.length?null:'No priced line items found. Check the source layout or enter rows manually.'};
  }
  function similarity(a,b){
    if(a.code&&b.code&&norm(a.code)===norm(b.code))return 1;
    const x=norm(a.description),y=norm(b.description);if(!x||!y)return 0;
    const stop=new Set(['the','with','and','for','ea','each','sink','bowl','w','xl']);
    const sx=new Set(x.split(' ').filter(t=>!stop.has(t))),sy=new Set(y.split(' ').filter(t=>!stop.has(t)));
    const shared=[...sx].filter(t=>sy.has(t));if(shared.length<2)return 0;
    const overlap=shared.length/Math.max(1,Math.min(sx.size,sy.size));
    const grams=s=>{let out=[];for(let i=0;i<s.length-1;i++)out.push(s.slice(i,i+2));return out};
    const gx=grams(x),gy=grams(y);let hits=0,copy=[...gy];
    for(const gram of gx){const i=copy.indexOf(gram);if(i>=0){hits++;copy.splice(i,1)}}
    const dice=2*hits/Math.max(1,gx.length+gy.length);
    return 0.65*overlap+0.35*dice;
  }
  function buildGroups(quotes,baseline){
    const groups=baseline.map(e=>({description:e.description,code:e.code,qty:e.qty,unit:e.unit,baseline_price:e.unit_price,matches:{},confidence:'baseline'}));
    quotes.forEach((q,qi)=>q.items.forEach(entry=>{
      let best=-1,score=0;
      groups.forEach((group,gi)=>{if(group.matches[qi])return;const s=similarity(entry,group);if(s>score){score=s;best=gi}});
      if(score>=0.70){const group=groups[best];group.matches[qi]=entry;if(score<0.93)group.confidence='review';else if(['new','unmatched'].includes(group.confidence))group.confidence='matched'}
      else groups.push({description:entry.description,code:entry.code,qty:entry.qty,unit:entry.unit,baseline_price:null,matches:{[qi]:entry},confidence:qi?'unmatched':'new'});
    }));
    return groups;
  }
  function compare(quotes,groups){
    const names=quotes.map(q=>q.name),totals=quotes.map(()=>0),covered=quotes.map(()=>0);
    const rows=groups.map(group=>{
      const qty=number(group.qty)||1;
      const prices=quotes.map((q,i)=>{const value=Number(group.matches?.[i]?.unit_price);return group.matches?.[i]&&Number.isFinite(value)&&value>=0?Math.round(value*1e6)/1e6:null});
      const available=prices.filter(p=>p!=null),best=available.length?Math.min(...available):null;
      const values=prices.map(p=>p==null?null:Math.round(qty*p*100)/100);
      values.forEach((v,i)=>{if(v!=null){totals[i]+=v;covered[i]++}});
      return {...group,prices,values,best,winners:names.filter((_,i)=>prices[i]!=null&&prices[i]===best),spread:available.length>1?Math.round((Math.max(...available)-best)*qty*100)/100:null,baseline_total:group.baseline_price!=null?Math.round(qty*group.baseline_price*100)/100:null};
    });
    const complete=covered.map(n=>n===rows.length);
    const landed=quotes.map((q,i)=>Math.round((totals[i]+(number(q.freight)||0)+(number(q.tax)||0)-(number(q.discount)||0))*100)/100);
    return {rows,names,totals:totals.map(x=>Math.round(x*100)/100),landed,covered,complete,row_count:rows.length};
  }
  function exportBook(data){
    const quotes=data.quotes||[],report=compare(quotes,data.groups||[]),book=XLSX.utils.book_new();
    const completeTotals=report.landed.filter((_,i)=>report.complete[i]);
    const lowest=completeTotals.length?Math.min(...completeTotals):null;
    const summary=[['Project',clean(data.project)],['Quoted line costs use required quantities. Check tax, freight and discounts against quote terms.'],['Supplier','Price basis','Lines covered','Complete?','Line cost','Freight','Tax / GST','Discount','Total evaluated','Quoted total','Variance to quote','Gap to lowest complete']];
    quotes.forEach((q,i)=>summary.push([q.name,q.price_basis||'unspecified',`${report.covered[i]}/${report.row_count}`,report.complete[i]?'Yes':'No',report.totals[i],number(q.freight)||0,number(q.tax)||0,number(q.discount)||0,report.landed[i],q.quoted_total??null,q.quoted_total!=null?Math.round((report.landed[i]-q.quoted_total)*100)/100:null,report.complete[i]&&lowest!=null?Math.round((report.landed[i]-lowest)*100)/100:null]));
    const s=XLSX.utils.aoa_to_sheet(summary);s['!cols']=[{wch:28},...Array.from({length:11},()=>({wch:19}))];XLSX.utils.book_append_sheet(book,s,'Financial summary');
    const header=['Code','Description','Required Qty','Unit','Baseline Unit','Baseline Total'];
    quotes.forEach(q=>header.push(`${q.name} Quoted Code`,`${q.name} Quoted Description`,`${q.name} Quoted Qty`,`${q.name} Quoted Unit`,`${q.name} Unit Price`,`${q.name} At Required Qty`,`${q.name} Source`));
    header.push('Lowest Unit','Lowest Supplier','Price Spread at Required Qty','Review Flag');
    const matrix=[['QUOTE COMPARISON'],['Project',clean(data.project)],['Missing lines are excluded from quote totals.'],header];
    report.rows.forEach(row=>{
      const values=[row.code,row.description,row.qty,row.unit,row.baseline_price,row.baseline_total];
      quotes.forEach((q,qi)=>{const e=row.matches?.[qi];values.push(e?.code||null,e?.full_description||e?.description||null,e?.qty??null,e?.unit||null,row.prices[qi],row.values[qi],e?.source||'MISSING')});
      values.push(row.best,row.winners.join(', '),row.spread,row.confidence);matrix.push(values);
    });
    matrix.push([],['QUOTE TOTALS','','','','','',...report.totals.flatMap(x=>['','','','','',x,''])],['LINES COVERED','','','','','',...report.covered.flatMap(x=>['','','','','',`${x}/${report.row_count}`,''])]);
    const c=XLSX.utils.aoa_to_sheet(matrix);c['!cols']=header.map((title,i)=>({wch:i===1||title.includes('Description')?42:title.includes('Source')?24:17}));XLSX.utils.book_append_sheet(book,c,'Comparison');
    const sources=[['Quote','Code','Description','Quoted Qty','Unit','Quoted Unit Price','Quoted Line Total','Source']];
    quotes.forEach(q=>q.items.forEach(e=>sources.push([q.name,e.code,e.full_description||e.description,e.qty,e.unit,e.unit_price,e.total,e.source])));
    const d=XLSX.utils.aoa_to_sheet(sources);d['!cols']=[{wch:24},{wch:18},{wch:52},...Array.from({length:4},()=>({wch:17})),{wch:30}];XLSX.utils.book_append_sheet(book,d,'Source lines');
    return XLSX.write(book,{type:'array',bookType:'xlsx'});
  }
  const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  window.fetch=async(input,init={})=>{
    const path=typeof input==='string'?input:new URL(input.url).pathname;
    if(path==='/api/import'){
      const files=init.body.getAll('files');const out=[];
      for(const file of files){try{out.push(await parseFile(file))}catch(err){out.push({name:file.name,kind:'error',items:[],warning:err.message})}}
      return json(out);
    }
    if(path==='/api/compare'){
      const data=JSON.parse(init.body);return json(compare(data.quotes||[],data.groups??buildGroups(data.quotes||[],data.baseline||[])));
    }
    if(path==='/api/export'){
      const buffer=exportBook(JSON.parse(init.body));
      return new Response(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),{status:200});
    }
    return originalFetch(input,init);
  };
})();
