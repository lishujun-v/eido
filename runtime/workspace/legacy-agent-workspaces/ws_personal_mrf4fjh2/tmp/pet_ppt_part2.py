"""Part2: 后续页面和保存"""

# Slide 6: 饮食
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"日常饲养：饮食","科学喂养是健康的基础")
card(s,Inches(0.6),Inches(2.1),Inches(5.8),Inches(2.5),"推荐做法",[
"选择正规品牌宠物粮，查看配料表","根据年龄选择幼年/成年/老年粮",
"定时定量喂食，避免自由采食","保证充足清洁饮水","适当补充湿粮，增加水分摄入"],
color=GREEN,ts=20,is_=15)
card(s,Inches(6.8),Inches(2.1),Inches(5.8),Inches(2.5),"禁忌食物",[
"巧克力、咖啡因（可可碱中毒）","葡萄、葡萄干（肾衰竭）",
"洋葱、大蒜（溶血性贫血）","木糖醇（低血糖/肝衰竭）","牛奶（多数宠物乳糖不耐受）"],
color=ORANGE,ts=20,is_=15)
txt(s,Inches(0.6),Inches(5.0),Inches(5),Inches(0.4),"喂食频率参考",size=18,color=DARK,bold=True)
for i,(st,f,note) in enumerate([("幼犬/幼猫","每天3-4次","少食多餐"),("成年犬/猫","每天2次","早晚各一次"),("老年犬/猫","每天2次","易消化食物")]):
    y=Inches(5.5+i*0.45);rrect(s,Inches(0.6),y,Inches(3.5),Inches(0.4),WHITE)
    txt(s,Inches(0.8),y,Inches(1.5),Inches(0.4),st,size=14,color=DARK,bold=True,anchor=MSO_ANCHOR.MIDDLE)
    txt(s,Inches(2.3),y,Inches(1.5),Inches(0.4),f,size=13,color=TEAL,bold=True,anchor=MSO_ANCHOR.MIDDLE)
    txt(s,Inches(3.5),y,Inches(1.5),Inches(0.4),note,size=12,color=GRAY,anchor=MSO_ANCHOR.MIDDLE)

# Slide 7: 环境与运动
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"日常饲养：环境与运动","打造安全舒适的生活空间")
card(s,Inches(0.6),Inches(2.1),Inches(3.8),Inches(2.5),"居住环境",[
"保持通风、温度适宜","提供专属休息区域","收好电线、小物件等危险品",
"猫需猫砂盆和猫抓板","狗需舒适的窝和围栏"],color=TEAL,ts=18,is_=14)
card(s,Inches(4.6),Inches(2.1),Inches(3.8),Inches(2.5),"清洁卫生",[
"定期清洗食碗水碗","猫砂盆每天清理1-2次","定期洗澡（狗1-2周，猫按需）",
"梳理毛发，减少毛球","定期消毒居住区域"],color=BLUE,ts=18,is_=14)
card(s,Inches(8.6),Inches(2.1),Inches(3.8),Inches(2.5),"运动与互动",[
"狗：每天遛弯30-60分钟","猫：每天逗猫棒玩耍15-30分钟","提供益智玩具",
"定期社交训练","避免长时间独处"],color=ORANGE,ts=18,is_=14)
rrect(s,Inches(0.6),Inches(5.0),Inches(11.8),Inches(1.8),WHITE)
shp(s,MSO_SHAPE.RECTANGLE,Inches(0.6),Inches(5.0),Inches(11.8),Inches(0.06),ACCENT)
txt(s,Inches(0.9),Inches(5.2),Inches(11),Inches(0.4),"小贴士",size=18,color=ACCENT,bold=True)
mtxt(s,Inches(0.9),Inches(5.7),Inches(11),Inches(1),[
"不同品种运动需求差异大，请根据品种特性调整","夏季注意防暑降温，冬季注意保暖","互动不仅是运动，也是增进感情的重要方式"],size=14,color=DARK,sp=4)

# Slide 8: 疫苗与驱虫
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"宠物健康：疫苗与驱虫","预防胜于治疗")
card(s,Inches(0.6),Inches(2.1),Inches(5.8),Inches(4.5),"疫苗",[
"核心疫苗（必打）：","  犬：犬瘟、细小、传染性肝炎、狂犬","  猫：猫瘟、猫杯状、猫鼻支、狂犬",
"非核心疫苗（按需）：","  犬：钩端螺旋体、犬咳等","  猫：猫白血病等",
"接种时间：","  幼犬/幼猫6-8周龄开始，每隔3-4周一次","  共3-4针，之后每年加强一次",
"注意事项：","  接种前后一周避免洗澡","  健康状态下方可接种"],color=TEAL,ts=20,is_=14)
card(s,Inches(6.8),Inches(2.1),Inches(5.8),Inches(4.5),"驱虫",[
"体内驱虫：","  幼宠每月一次，成宠每3个月一次","  常见寄生虫：蛔虫、绦虫、钩虫等",
"体外驱虫：","  每月一次（春夏高频季节）","  常见寄生虫：跳蚤、蜱虫、虱子等",
"驱虫药选择：","  选择正规品牌，按体重用药","  体内外可同日进行，间隔72小时",
"注意事项：","  驱虫前后观察宠物状态","  孕宠、病宠需遵医嘱"],color=ORANGE,ts=20,is_=14)

# Slide 9: 常见疾病预防
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"常见疾病预防","早发现早治疗")
card(s,Inches(0.6),Inches(2.1),Inches(3.8),Inches(4.5),"猫常见疾病",[
"猫瘟（泛白细胞减少症）","猫鼻支（疱疹病毒）","猫杯状病毒感染",
"猫传腹（FIP）","泌尿系统疾病","毛球症","肥胖症","口腔疾病"],
color=TEAL,ts=18,is_=14)
card(s,Inches(4.6),Inches(2.1),Inches(3.8),Inches(4.5),"狗常见疾病",[
"犬瘟热","犬细小病毒","犬传染性肝炎","犬副流感",
"犬冠状病毒","皮肤病（真菌/螨虫）","关节炎","肥胖症"],
color=ORANGE,ts=18,is_=14)
card(s,Inches(8.6),Inches(2.1),Inches(3.8),Inches(4.5),"预防措施",[
"按时接种疫苗","定期驱虫","每年体检1-2次",
"保持环境卫生","科学饮食，控制体重","观察精神状态和食欲",
"发现异常及时就医","不要自行用药"],color=GREEN,ts=18,is_=14)

# Slide 10: 宠物与人类的关系
s=prs.slides.add_slide(prs.slide_layouts[6]);tbar(s,"宠物与人类的关系","彼此治愈的伙伴关系")
card(s,Inches(0.6),Inches(2.1),Inches(3.8),Inches(2.5),"心理健康益处",[
"减轻焦虑和抑郁","降低孤独感","增加户外活动量","提升幸福感"],
color=TEAL,ts=18,is_=14)
card(s,Inches(4.6),Inches(2.1),Inches(3.8),Inches(2.5),"生理健康益处",[
"降低血压和心率","增强免疫力","减少过敏（儿童早期接触）","增加运动量"],
color=GREEN,ts=18,is_=14)
card(s,Inches(8.6),Inches(2.1),Inches(3.8),Inches(2.5),"社交价值",[
"宠物是社交话题","遛狗增加邻里交流","宠物社区/活动","辅助治疗（宠物疗法）"],
color=BLUE,ts=18,is_=14)
rrect(s,Inches(0.6),Inches(5.0),Inches(11.8),Inches(1.8),WHITE)
shp(s,MSO_SHAPE.RECTANGLE,Inches(0.6),Inches(5.0),Inches(11.8),Inches(0.06),ACCENT)
txt(s,Inches(0.9),Inches(5.2),Inches(11),Inches(0.4),"记住",size=18,color=ACCENT,bold=True)
mtxt(s,Inches(0.9),Inches(5.7),Inches(11),Inches(1),[
"宠物不仅仅是宠物，它们是家人","它们用一生陪伴我们，请用爱回报","领养代替购买，不离不弃"],size=14,color=DARK,sp=4)

# Slide 11: 结尾
s=prs.slides.add_slide(prs.slide_layouts[6])
add_bg(s,TEAL)
shp(s,MSO_SHAPE.OVAL,Inches(-1),Inches(-1),Inches(4),Inches(4),RGBColor(0x2D,0xC7,0xBB))
shp(s,MSO_SHAPE.OVAL,Inches(10.5),Inches(4.5),Inches(5),Inches(5),RGBColor(0x2D,0xC7,0xBB))
txt(s,Inches(1.5),Inches(2.5),Inches(10),Inches(1.2),"谢谢观看",size=44,color=WHITE,bold=True,align=PP_ALIGN.CENTER)
txt(s,Inches(1.5),Inches(4.0),Inches(10),Inches(0.8),"爱护动物，科学养宠",size=22,color=RGBColor(0xD0,0xF5,0xF2),align=PP_ALIGN.CENTER)
txt(s,Inches(1.5),Inches(5.5),Inches(10),Inches(0.5),"愿每一只宠物都被温柔以待",size=16,color=RGBColor(0xA0,0xE0,0xDC),align=PP_ALIGN.CENTER)

# 保存
import os
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","artifacts","宠物科普与养护指南.pptx")
prs.save(out)
print(f"已保存: {out}")
print(f"共 {len(prs.slides)} 页")
