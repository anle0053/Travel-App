const KEY=process.env.GOOGLE_API_KEY,CX=process.env.SEARCH_ENGINE_ID;
const isCN=s=>/[\u4e00-\u9fff]/.test(s);
const domain=url=>{try{return new URL(url).hostname.replace('www.','');}catch{return '';}};

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if(req.method==='OPTIONS')return res.status(200).end();

  const{q}=req.query;
  if(!q)return res.status(400).json({error:'請提供搜尋關鍵字'});
  if(!KEY||!CX)return res.status(500).json({error:'請在 Vercel 環境變數設定 GOOGLE_API_KEY 和 SEARCH_ENGINE_ID'});

  try{
    // 1. Custom Search
    const sr=await fetch(`https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CX}&q=${encodeURIComponent(q)}&num=8&gl=tw&hl=zh-TW&lr=lang_zh-TW|lang_zh-CN|lang_ja|lang_en`);
    if(!sr.ok){const e=await sr.json();return res.status(502).json({error:'搜尋失敗：'+(e?.error?.message||sr.status)});}
    const sd=await sr.json(),items=sd.items||[];

    // 2. 批次翻譯非中文欄位
    const toTrans=items.filter(it=>!isCN(it.title)||!isCN(it.snippet||''));
    if(toTrans.length){
      const texts=toTrans.flatMap(it=>[isCN(it.title)?null:it.title,isCN(it.snippet||'')?null:(it.snippet||'')]).filter(Boolean);
      if(texts.length){
        const tr=await fetch(`https://translation.googleapis.com/language/translate/v2?key=${KEY}`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({q:texts,target:'zh-TW',format:'text'})
        });
        if(tr.ok){
          const td=await tr.json(),translated=(td.data?.translations||[]).map(t=>t.translatedText);
          let i=0;
          toTrans.forEach(it=>{
            if(!isCN(it.title)&&translated[i])it.title=translated[i++];
            if(!isCN(it.snippet||'')&&translated[i])it.snippet=translated[i++];
          });
        }
      }
    }

    // 3. 回傳
    res.status(200).json({results:items.map(it=>({
      name:it.title,url:it.link,desc:it.snippet||'',
      thumb:it.pagemap?.cse_thumbnail?.[0]?.src||it.pagemap?.cse_image?.[0]?.src||null,
      source:domain(it.link)
    })),total:sd.searchInformation?.totalResults||'0'});

  }catch(e){res.status(500).json({error:'伺服器錯誤：'+e.message});}
}
