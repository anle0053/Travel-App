const KEY=process.env.SERPAPI_KEY;
const isCN=s=>/[\u4e00-\u9fff]/.test(s);
const domain=url=>{try{return new URL(url).hostname.replace('www.','');}catch{return '';}};

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if(req.method==='OPTIONS')return res.status(200).end();

  const{q}=req.query;
  if(!q)return res.status(400).json({error:'請提供搜尋關鍵字'});
  if(!KEY)return res.status(500).json({error:'請在 Vercel 環境變數設定 SERPAPI_KEY'});

  try{
    const url=`https://serpapi.com/search.json?q=${encodeURIComponent(q)}&hl=zh-tw&gl=tw&num=8&api_key=${KEY}`;
    const sr=await fetch(url);
    if(!sr.ok){const e=await sr.json();return res.status(502).json({error:'搜尋失敗：'+(e?.error||sr.status)});}
    const sd=await sr.json();
    const items=sd.organic_results||[];
    if(!items.length)return res.status(200).json({results:[],total:'0'});

    // 翻譯非中文內容
    const GK=process.env.GOOGLE_API_KEY;
    if(GK){
      const toTrans=items.filter(it=>!isCN(it.title)||!isCN(it.snippet||''));
      if(toTrans.length){
        const texts=toTrans.flatMap(it=>[isCN(it.title)?null:it.title,isCN(it.snippet||'')?null:(it.snippet||'')]).filter(Boolean);
        if(texts.length){
          const tr=await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GK}`,{
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
    }

    res.status(200).json({results:items.map(it=>({
      name:it.title,
      url:it.link,
      desc:it.snippet||'',
      thumb:it.thumbnail||null,
      source:domain(it.link)
    })),total:String(items.length)});

  }catch(e){res.status(500).json({error:'伺服器錯誤：'+e.message});}
}
