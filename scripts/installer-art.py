from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parent.parent
def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf', size)
def panel(size):
    im = Image.new('RGB', size)
    px = im.load()
    for y in range(size[1]):
        for x in range(size[0]):
            glow = max(0, 1 - ((x/size[0]-.6)**2 + (y/size[1]-.28)**2)*3)
            px[x,y] = (int(5+glow*4), int(11+glow*16), int(20+glow*30))
    return im
icon = Image.open(ROOT/'build/icon.png').convert('RGBA')
sidebar = panel((164,314)); draw=ImageDraw.Draw(sidebar)
draw.line((20,25,144,25), fill='#16d6e8', width=2)
sidebar.paste(icon.resize((116,116), Image.Resampling.LANCZOS),(24,53),icon.resize((116,116), Image.Resampling.LANCZOS))
draw.text((17,187),'CodeHarbor',font=font(19,True),fill='#edf5ff')
draw.text((129,187),'X',font=font(19,True),fill='#ffad1f')
draw.text((20,224),'Your local',font=font(12),fill='#91abc7')
draw.text((20,242),'development harbor.',font=font(12),fill='#91abc7')
draw.rounded_rectangle((20,283,144,286),radius=1,fill='#0a7bff')
sidebar.save(ROOT/'build/installerSidebar.bmp')
header=Image.new('RGB',(150,57),'#f4f8fc'); draw=ImageDraw.Draw(header)
small=icon.resize((38,38),Image.Resampling.LANCZOS);header.paste(small,(3,9),small)
draw.text((47,15),'CodeHarborX',font=font(13,True),fill='#08172c')
draw.text((47,34),'YOUR LOCAL HARBOR',font=font(7),fill='#657994')
header.save(ROOT/'build/installerHeader.bmp')
