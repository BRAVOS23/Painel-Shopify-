import {completedSale,countOrders} from './sales.mjs';
const $=id=>document.getElementById(id);
export function orderSummary(rows){
 const done=rows.filter(completedSale),open=rows.filter(row=>['pendente','remarcado'].includes(row.status));
 return {total:countOrders(rows),done:countOrders(done),open:countOrders(open),review:countOrders(rows.filter(row=>row.status==='concluido' && !completedSale(row))),cancelled:countOrders(rows.filter(row=>row.status==='cancelado')),rescheduled:countOrders(rows.filter(row=>row.status==='remarcado')),revenue:done.reduce((sum,row)=>sum+(row.valor || 0),0)};
}
export function sourceCounts(rows){
 const orders=new Map();for(const row of rows){const id=row.shopifyOrderId || row.id;if(!orders.has(id))orders.set(id,row.fonte || '05.OUTRO');}
 const groups={};for(const source of orders.values())groups[source]=(groups[source] || 0)+1;return groups;
}
export function orderSeries(rows,start,end){
 if(!start || !end)return {labels:[],orders:[],done:[],revenue:[],unit:'dia'};
 const days=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1,unit=days>180?'mês':days>62?'semana':'dia',buckets=new Map();
 const key=date=>unit==='mês'?date.slice(0,7):unit==='semana'?new Date(Date.parse(start)+Math.floor((Date.parse(date)-Date.parse(start))/604800000)*604800000).toISOString().slice(0,10):date;
 for(let day=Date.parse(start);day<=Date.parse(end);day+=86400000){const id=key(new Date(day).toISOString().slice(0,10));if(!buckets.has(id))buckets.set(id,[]);}
 for(const row of rows){if(row.data>=start && row.data<=end)buckets.get(key(row.data))?.push(row);}
 const entries=[...buckets],summary=entries.map(([,items])=>orderSummary(items));
 return {labels:entries.map(([date])=>unit==='mês'?date.slice(5)+'/'+date.slice(0,4):date.slice(8)+'/'+date.slice(5,7)),orders:summary.map(item=>item.total),done:summary.map(item=>item.done),revenue:summary.map(item=>item.revenue),unit};
}
export function initOrderReports(){
 const charts=new Map(),money=value=>Number(value || 0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' MT';
 function draw(id,type,labels,datasets,monetary=false,horizontal=false){
  charts.get(id)?.destroy();charts.delete(id);const canvas=$(id);if(!canvas)return;
  const empty=labels.length===0 || !datasets.some(set=>set.data.some(value=>value>0));canvas.hidden=empty;$(id+'Empty').hidden=!empty;if(empty)return;
  const style=getComputedStyle(document.documentElement),ink=style.getPropertyValue('--sand-dim').trim(),grid=style.getPropertyValue('--panel-line').trim();
  const options={responsive:true,maintainAspectRatio:false,animation:false,indexAxis:horizontal?'y':'x',interaction:{mode:'index',intersect:false},plugins:{legend:{display:datasets.length>1,labels:{color:ink,usePointStyle:true,boxWidth:8}},tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+(monetary?money(ctx.parsed.y):ctx.raw)}}},scales:{x:{grid:{display:!horizontal,color:grid},ticks:{color:ink,maxTicksLimit:6,maxRotation:0,...(horizontal?{precision:0}:{})},...(horizontal?{beginAtZero:true}:{})},y:{beginAtZero:true,grid:{color:grid,display:!horizontal},ticks:{color:ink,...(!horizontal?{precision:0}:{}),...(monetary?{callback:value=>(Math.abs(value)>=1000?(value/1000).toLocaleString('pt-PT')+' mil':value)+' MT'}:{})}}}};
  charts.set(id,new window.Chart(canvas,{type,data:{labels,datasets},options}));
 }
 const line=(label,data,color)=>({label,data,borderColor:color,backgroundColor:color+'18',borderWidth:2,pointRadius:0,pointHitRadius:18,pointHoverRadius:4,tension:.15,fill:false});
 window.renderOrderReportCharts=(rows,range)=>{
  if(!$('vendasViewRelatorios').classList.contains('active'))return;
  const summary=orderSummary(rows);$('ovPendente').textContent=summary.open;$('reportRevenue').textContent=money(summary.revenue);
  const dates=rows.map(row=>row.data).filter(Boolean).sort(),start=range?.[0] || dates[0],end=range?.[1] || dates.at(-1),series=orderSeries(rows,start,end);
  $('ordersTrendUnit').textContent='Por '+series.unit+' · data registada no pedido';
  draw('ordersTrendChart','line',series.labels,[line('Pedidos',series.orders,'#4384d3'),line('Concluídos',series.done,'#21966a')]);
  draw('ordersStatusChart','bar',['Concluídos','Pendentes','Remarcados','Cancelados',...(summary.review?['A verificar']:[])],[{label:'Pedidos',data:[summary.done,countOrders(rows.filter(row=>row.status==='pendente')),summary.rescheduled,summary.cancelled,...(summary.review?[summary.review]:[])],backgroundColor:['#21966a','#4384d3','#d59b32','#db546d','#8b8993'],borderRadius:6,maxBarThickness:28}],false,true);
 };
 window.renderMonthReport=(rows,month)=>{
  if(!$('vendasViewMeses').classList.contains('active'))return;
  const summary=orderSummary(rows),current=rows.filter(row=>row.mes===month),activeSummary=orderSummary(current);
  $('historyTotal').textContent=summary.total;$('historyOpen').textContent=activeSummary.open;$('historyRevenue').textContent=money(activeSummary.revenue);
  const moved=countOrders(rows.filter(row=>row.mes!==month));$('historyScope').textContent=moved?`${moved} pedido(s) transferido(s) para outro mês aparecem no histórico, mas não entram na receita deste mês.`:'O resumo acompanha os filtros. A receita inclui apenas pedidos concluídos com data neste mês.';
  const end=month?new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10):null,series=orderSeries(current,month?month+'-01':null,end);
  draw('historyRevenueChart','line',series.labels,[line('Receita concluída',series.revenue,'#21966a')],true);
 };
 window.addEventListener('resize',()=>{for(const chart of charts.values())chart.resize();});
 window.renderOverview();window.renderHistoricoMeses();
}
