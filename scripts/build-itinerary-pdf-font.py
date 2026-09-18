"""Build the static PDF face. See public/fonts/README.md for source and setup."""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import json
font = instantiateVariableFont(TTFont(sys.argv[1]), {'wght':400}, inplace=True)
for rec in font['name'].names:
    if rec.nameID in (1,3,4,6,16): rec.string = 'TravelCJK-Regular'.encode(rec.getEncoding())
font.flavor = None
font.save('public/fonts/TravelCJK-Regular.ttf')
codes = sorted(font.getBestCmap())
ranges=[]
for code in codes:
    if ranges and ranges[-1][1]+1 == code: ranges[-1][1] = code
    else: ranges.append([code,code])
with open('src/lib/exporters/pdfFontCoverage.json','w') as f: json.dump(ranges,f,separators=(',',':'))
