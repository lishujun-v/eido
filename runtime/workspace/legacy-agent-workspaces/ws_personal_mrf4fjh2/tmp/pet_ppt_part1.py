#!/usr/bin/env python3
"""生成宠物科普与养护指南PPT - Part1: 基础设施和前4页"""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

TEAL=RGBColor(0x26,0xA6,0x9A);DARK=RGBColor(0x2D,0x3A,0x4A);LIGHT=RGBColor(0xF5,0xF7,0xFA)
ACCENT=RGBColor(0xFF,0x9F,0x43);WHITE=RGBColor(0xFF,0xFF,0xFF);GRAY=RGBColor(0x7F,0x8C,0x8D)
ORANGE=RGBColor(0xFF,0x6B,0x6B);GREEN=RGBColor(0x27,0xAE,0x60);BLUE=RGBColor(0x34,0x98,0xDB)

prs=Presentation()
prs.slide_width=Inches(13.333);prs.slide_height=Inches(7.5)
H=prs.slide_height

def add_bg(s,c):
    bg=s.background.fill;bg.solid();bg.fore_color.rgb=c
def shp(s,t,l,tp,w,h,c):
    a=s.shapes.add_shape(t,l,tp,w,h);a.fill.solid();a.fill.fore_color.rgb=c;a.line.fill.background();return a
def rrect(s,l,tp,w,h,c):
    a=shp(s,MSO_SHAPE.ROUNDED_RECTANGLE,l,tp,w,h,c);a.adjustments[0]=0.06;return a
def txt(s,l,tp,w,h,t,size=18,color=DARK,bold=False,align=PP_ALIGN.LEFT,anchor=MSO_ANCHOR.TOP):
    tb=s.shapes.add_textbox(l,tp,w,h);tf=tb.text_frame;tf.word_wrap=True;tf.vertical_anchor=anchor
    p=tf.paragraphs[0];p.text=t;p.font.size=Pt(size);p.font.color.rgb=color;p.font.bold=bold;p.alignment=align;return tb
def mtxt(s,l,tp,w,h,items,size=16,color=DARK,sp=6):
    tb=s.shapes.add_textbox(l,tp,w,h);tf=tb.text_frame;tf.word_wrap=True
    for i,it in enumerate(items):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text="• "+it;p.font.size=Pt(size);p.font.color.rgb=color;p.space_after=Pt(sp)
    return tb
def tbar(s,title,sub=""):
    add_bg(s,LIGHT);shp(s,MSO_SHAPE.RECTANGLE,0,0,Inches(0.12),H,TEAL)
    txt(s,Inches(0.6),Inches(0.4),Inches(11),Inches(1),title,size=32,color=DARK,bold=True)
    if sub:txt(s,Inches(0.6),Inches(1.15),Inches(11),Inches(0.5),sub,size=16,color=GRAY)
    shp(s,MSO_SHAPE.RECTANGLE,Inches(0.6),Inches(1.75),Inches(2.5),Pt(3),TEAL)
def card(s,l,tp,w,h,title,items,color=TEAL,ts=18,is_=14):
    rrect(s,l,tp,w,h,WHITE);shp(s,MSO_SHAPE.RECTANGLE,l,tp,w,Inches(0.06),color)
    txt(s,l+Inches(0.25),tp+Inches(0.2),w-Inches(0.5),Inches(0.5),title,size=ts,color=color,bold=True)
    mtxt(s,l+Inches(0.25),tp+Inches(0.75),w-Inches(0.5),h-Inches(1),items,size=is_,color=DARK,sp=4)

# Slide 1: 封面
s=prs.slides.add_slide(prs.slide_layouts[6])
add_bg(s,TEAL)
shp(s,MSO_SHAPE.OVAL,Inches(-1),Inches(-1),Inches(4),Inches(4),RGBColor(0x2D,0xC7,0xBB))
shp(s,MSO_SHAPE.OVAL,Inches(10.5),Inches(4.5),Inches(5),Inches(5),RGBColor(0x2D,0xC7,0xBB))
shp(s,MSO_SHAPE.OVAL,Inches(9),Inches(-1.5),Inches(3),Inches(3),ACCENT)
txt(s,Inches(1.5),Inches(2.2),Inches(10),Inches(1.5),"宠物科普与养护指南",size=48,color=WHITE,bold=True,align=PP_ALIGN.CENTER)
txt(s,Inches(1.5),Inches(3.8),Inches(10),Inches(0.8),"从选宠到日常护理的全面手册",size=22,color=RGBColor(0xD0,0xF5,0xF2),align=PP_ALIGN.CENTER)
txt(s,Inches(1.5),Inches(6.2),Inches(10),Inches(0.5),"做一个负责任的宠物主人",size=16,color=RGBColor(0xA0,0xE0,0xDC),align=PP_ALIGN.CENTER)

# Slide 2: 目录
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"目录","CONTENTS")
toc=[("01","常见宠物种类介绍","猫、狗、小型哺乳类、鸟类、水族"),("02","选择宠物的考量因素","时间、空间、经济、过敏等"),
("03","日常饲养要点","饮食、环境、运动与互动"),("04","宠物健康与护理","疫苗、驱虫、常见疾病预防"),
("05","宠物与人类的关系","心理健康与陪伴价值")]
for i,(num,title,desc) in enumerate(toc):
    y=Inches(2.1+i*0.95);rrect(s,Inches(1.0),y,Inches(11),Inches(0.8),WHITE)
    txt(s,Inches(1.3),y+Inches(0.1),Inches(0.8),Inches(0.6),num,size=28,color=TEAL,bold=True,anchor=MSO_ANCHOR.MIDDLE)
    txt(s,Inches(2.3),y+Inches(0.08),Inches(4),Inches(0.4),title,size=18,color=DARK,bold=True)
    txt(s,Inches(2.3),y+Inches(0.45),Inches(8),Inches(0.3),desc,size=13,color=GRAY)

# Slide 3: 常见宠物种类
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"常见宠物种类","五大热门宠物类群速览")
pets=[("猫",TEAL,["独立优雅，适合忙碌人群","寿命12-18年","常见：英短、美短、布偶、橘猫"]),
("狗",ORANGE,["忠诚活泼，需要大量互动","寿命10-15年","常见：金毛、拉布拉多、柯基、泰迪"]),
("小型哺乳类",ACCENT,["仓鼠、兔子、龙猫等","体型小，饲养空间需求低","适合空间有限的家庭"]),
("鸟类",GREEN,["鹦鹉、文鸟、金丝雀等","互动性强，部分会学舌","需注意噪音和笼舍清洁"]),
("水族",BLUE,["观赏鱼、龟等","观赏价值高，安静无扰","需定期维护水质和过滤系统"])]
pos=[(Inches(0.6),Inches(2.1)),(Inches(4.6),Inches(2.1)),(Inches(8.6),Inches(2.1)),(Inches(2.6),Inches(4.5)),(Inches(6.6),Inches(4.5))]
for (title,color,items),(x,y) in zip(pets,pos):
    card(s,x,y,Inches(3.8),Inches(2.2),title,items,color=color,ts=20,is_=13)

# Slide 4: 猫vs狗
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"猫 vs 狗","两大主流宠物的核心差异")
lc,mc,rc=Inches(1.5),Inches(5.0),Inches(8.5);ty=Inches(2.1);rh=Inches(0.7)
for j,(h,x) in enumerate(zip(["维度","猫","狗"],[lc,mc,rc])):
    bgc=TEAL if j==0 else (RGBColor(0xFF,0xB3,0xB3) if j==2 else RGBColor(0xB3,0xE6,0xE0))
    rrect(s,x,ty,Inches(3.3),rh,bgc)
    txt(s,x+Inches(0.2),ty,Inches(2.9),rh,h,size=18,color=WHITE if j==0 else DARK,bold=True,anchor=MSO_ANCHOR.MIDDLE)
rows=[("独立性","高，可独处较久","低，需要陪伴"),("运动需求","中等，室内即可","高，需每天遛"),
("训练难度","较高，性格倔强","较低，服从性好"),("空间需求","较小","较大"),
("日常打理","自我清洁+猫砂盆","需定期洗澡梳毛"),("年均花费","5000-10000元","8000-15000元")]
for i,(dim,cat,dog) in enumerate(rows):
    y=ty+rh*(i+1)+Inches(0.05*i)
    rrect(s,lc,y,Inches(3.3),rh,WHITE);rrect(s,mc,y,Inches(3.3),rh,RGBColor(0xE8,0xF8,0xF6));rrect(s,rc,y,Inches(3.3),rh,RGBColor(0xFF,0xF0,0xF0))
    txt(s,lc+Inches(0.2),y,Inches(2.9),rh,dim,size=15,color=DARK,bold=True,anchor=MSO_ANCHOR.MIDDLE)
    txt(s,mc+Inches(0.2),y,Inches(2.9),rh,cat,size=14,color=DARK,anchor=MSO_ANCHOR.MIDDLE)
    txt(s,rc+Inches(0.2),y,Inches(2.9),rh,dog,size=14,color=DARK,anchor=MSO_ANCHOR.MIDDLE)

# Slide 5: 选择宠物考量因素
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"选择宠物的考量因素","养宠前请认真评估以下几点")
factors=[("时间投入",ORANGE,["每日喂食、清洁","狗需每天遛1-2小时","猫需互动玩耍30分钟"]),
("居住空间",BLUE,["小型宠物空间需求低","中大型犬需宽敞空间","确认物业是否允许养宠"]),
("经济能力",GREEN,["初期：购买/领养+用品","每月：食物+猫砂/护理","医疗：体检+意外费用"]),
("过敏与健康",ACCENT,["确认家庭成员无过敏","了解宠物带来的健康风险"]),
("家庭情况",TEAL,["有无幼儿或老人","全家是否达成一致","出差时的照顾安排"]),
("长期承诺",ORANGE,["宠物寿命10-20年","搬家/结婚/生子不弃养","这是一份长期责任"])]
for i,(title,color,items) in enumerate(factors):
    x=Inches(0.6+(i%3)*4.1);y=Inches(2.1+(i//3)*2.4)
    card(s,x,y,Inches(3.8),Inches(2.2),title,items,color=color,ts=18,is_=13)
