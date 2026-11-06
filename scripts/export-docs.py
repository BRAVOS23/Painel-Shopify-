import re,html,sys
from urllib.parse import urljoin
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,Preformatted,KeepTogether,PageBreak
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
root=Path(__file__).resolve().parents[1];src=root/(sys.argv[1] if len(sys.argv)>1 else 'docs/MANUAL-TECNICO-E-FUNCIONAL.md');dest=src.with_suffix('.pdf')
source_text=src.read_text()
edition=re.search(r'^\*\*Atualizado:\*\*\s*(\d{2}/\d{2}/\d{4})',source_text,re.M)
reference=re.search(r'^\*\*Código de referência:\*\*\s*`([a-f0-9]{7,40})`',source_text,re.M)
footer=(edition.group(1) if edition else 'Edição do documento')+(' · Código '+reference.group(1) if reference else '')+' · Sem credenciais'
class HandbookDocument(SimpleDocTemplate):
 def afterFlowable(self,flowable):
  key=getattr(flowable,'bookmark_key',None)
  if key:
   level=0 if flowable.style.name=='DocSection' else 1
   title=flowable.getPlainText()
   self.canv.bookmarkPage(key)
   self.canv.addOutlineEntry(title,key,level=level,closed=level==0)
   self.notify('TOCEntry',(level,title,self.page,key))
font=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');bold=font.with_name('DejaVuSans-Bold.ttf');mono=font.with_name('DejaVuSansMono.ttf')
for name,path in [('Handbook',font),('HandbookBold',bold),('HandbookMono',mono)]:pdfmetrics.registerFont(TTFont(name,str(path)))
pdfmetrics.registerFontFamily('Handbook',normal='Handbook',bold='HandbookBold',italic='Handbook',boldItalic='HandbookBold')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TextDoc',fontName='Handbook',fontSize=9,leading=14,spaceAfter=7,textColor=colors.HexColor('#22332b')))
styles.add(ParagraphStyle(name='DocTitle',fontName='HandbookBold',fontSize=24,leading=31,spaceAfter=15,textColor=colors.HexColor('#176142')))
styles.add(ParagraphStyle(name='DocSection',fontName='HandbookBold',fontSize=16,leading=21,spaceBefore=17,spaceAfter=9,keepWithNext=True,textColor=colors.HexColor('#176142')))
styles.add(ParagraphStyle(name='DocSub',fontName='HandbookBold',fontSize=11,leading=16,spaceBefore=11,spaceAfter=6,keepWithNext=True))
styles.add(ParagraphStyle(name='DocCell',parent=styles['TextDoc'],fontSize=8,leading=11,spaceAfter=0))
styles.add(ParagraphStyle(name='DocCode',fontName='HandbookMono',fontSize=7,leading=10,spaceAfter=10,backColor=colors.HexColor('#f1f5f3'),borderPadding=9))
styles.add(ParagraphStyle(name='DocTocTitle',parent=styles['DocSection']))
styles.add(ParagraphStyle(name='DocToc0',fontName='Handbook',fontSize=9,leading=14,leftIndent=0,firstLineIndent=0,spaceBefore=6))
styles.add(ParagraphStyle(name='DocToc1',fontName='Handbook',fontSize=8,leading=12,leftIndent=12,firstLineIndent=0,spaceBefore=2))
styles.add(ParagraphStyle(name='DocBullet',parent=styles['TextDoc'],leftIndent=12,firstLineIndent=-8))
def inline(text):
 text=html.escape(text)
 def link(match):
  target=html.unescape(match.group(2))
  if not re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target) and not target.startswith('#'):
   target=urljoin('https://github.com/BRAVOS23/Painel-Shopify-/blob/main/'+src.parent.relative_to(root).as_posix()+'/',target)
  return '<link href="'+html.escape(target,quote=True)+'" color="#176142">'+match.group(1)+'</link>'
 text=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,text)
 text=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',text)
 text=re.sub(r'`([^`]+)`',r'<font name="HandbookMono">\1</font>',text)
 return text
story=[];lines=source_text.splitlines();i=0
def heading(value,style):
 paragraph=Paragraph(inline(value),styles[style]);paragraph.bookmark_key='heading-'+str(len(story));story.append(paragraph)
while i<len(lines):
 line=lines[i]
 if not line.strip():i+=1;continue
 if line.startswith('```'):
  i+=1;code=[]
  while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
  # Wrap long code to the printable page without changing the source document.
  wrapped=[]
  for value in code:
   while len(value)>102:wrapped.append(value[:102]);value='    '+value[102:]
   wrapped.append(value)
  story.append(Preformatted('\n'.join(wrapped),styles['DocCode']));i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].startswith('|'):
   cells=[c.strip() for c in lines[i].strip('|').split('|')]
   if not all(re.fullmatch(r'[-: ]+',c) for c in cells):rows.append([Paragraph(inline(c),styles['DocCell']) for c in cells])
   i+=1
  cols=len(rows[0]);width=483.27;colwidths=[width*.32,width*.68] if cols==2 else [width/cols]*cols
  table=Table(rows,colWidths=colwidths,repeatRows=1,hAlign='LEFT');table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e3eee8')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#d3ddd7')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f6f8f7')])]))
  story.extend([table,Spacer(1,10)]);continue
 if line.startswith('# '):story.append(Paragraph(inline(line[2:]),styles['DocTitle']));i+=1;continue
 if line=='## Índice':
  story.append(PageBreak());story.append(Paragraph('Índice',styles['DocTocTitle']));toc=TableOfContents();toc.levelStyles=[styles['DocToc0'],styles['DocToc1']];toc.dotsMinLevel=0;story.extend([toc,PageBreak()]);i+=1
  while i<len(lines) and not lines[i].startswith('## '):i+=1
  continue
 if line.startswith('## '):heading(line[3:],'DocSection');i+=1;continue
 if line.startswith('### '):heading(line[4:],'DocSub');i+=1;continue
 if line.startswith('- '):story.append(Paragraph('• '+inline(line[2:]),styles['DocBullet']));i+=1;continue
 if re.match(r'^\d+\. ',line):story.append(Paragraph(inline(line),styles['DocBullet']));i+=1;continue
 para=[line];i+=1
 while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|- |\d+\. )',lines[i]):para.append(lines[i]);i+=1
 story.append(Paragraph(inline(' '.join(para)),styles['TextDoc']))
def decorate(canvas,doc):
 canvas.saveState();canvas.setStrokeColor(colors.HexColor('#d3ddd7'));canvas.line(56,804,539,804);canvas.setFont('Handbook',7);canvas.setFillColor(colors.HexColor('#587064'));canvas.drawString(56,813,'PAINEL DO NEGÓCIO · DOCUMENTAÇÃO DE PASSAGEM');canvas.drawString(56,30,footer);canvas.drawRightString(539,30,str(doc.page));canvas.restoreState()
doc=HandbookDocument(str(dest),pagesize=A4,rightMargin=56,leftMargin=56,topMargin=52,bottomMargin=52,title=src.read_text().splitlines()[0].lstrip('# '),author='Projeto Painel do Negócio')
doc.multiBuild(story,onFirstPage=decorate,onLaterPages=decorate)
print(dest, dest.stat().st_size)
