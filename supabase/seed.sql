-- 81'DEGREE creator-os · demo seed (0001~0003 적용 후 실행)
-- 브랜드
insert into brands (name, color) values
  ('abib','#0E9E9A'),('naming','#E0518A'),('amuse','#F0A93B'),('vidivici','#6C5CE7'),('whipped','#F06595');

-- 크리에이터
insert into creators (pic,name,handle,followers,status,category,tone,monthly_quota,fixed_cost,intro,sns,rates) values
 (1,'merumi','@merumichandayo',27000,'active','스킨케어','에디토리얼',10,100000,'도쿄 기반 스킨케어·뷰티 에디토리얼 릴스.', '{"tiktok":"@merumi.tt","line":"merumi_01"}','{"reels":250000,"secondary":150000,"offline":230000,"etc":0}'),
 (2,'hina','@hinamiru',140000,'active','데일리','데일리',8,100000,'거리 인터뷰·데일리 브이로그로 20대 여성 팬층 확보.', '{"youtube":"@hinamiru","tiktok":"@hinamiru","x":"@hinamiru"}','{"reels":700000,"secondary":420000,"offline":630000,"etc":0}'),
 (3,'rui','@ruiluiruilui',50000,'active','메이크업','트렌디',8,100000,'트렌디 메이크업 튜토리얼·GRWM 중심.', '{"tiktok":"@rui.lui","x":"@ruiluirui"}','{"reels":400000,"secondary":240000,"offline":360000,"etc":0}'),
 (4,'momoco','@momo_2404',26000,'active','스킨케어','리뷰',15,100000,'스킨케어 리뷰·하울 전문.', '{"youtube":"@momoco","line":"momoco24"}','{"reels":250000,"secondary":150000,"offline":230000,"etc":0}'),
 (5,'momo','@_bogsuny',18500,'active','스킨케어','데일리',3,100000,'데일리 코디·뷰티 리뷰.', '{}','{"reels":150000,"secondary":90000,"offline":140000,"etc":0}'),
 (6,'chihiro','@ichi__da',132000,'active','리뷰','리뷰',2,100000,'제품 언박싱·리뷰어.', '{"youtube":"@ichida","tiktok":"@ichi_da"}','{"reels":700000,"secondary":420000,"offline":630000,"etc":0}'),
 (15,'kyoka','@kyokakikukeko',74000,'on_hold','데일리','데일리',0,0,'', '{}','{"reels":400000,"secondary":240000,"offline":360000,"etc":0}');

-- 계약 (2026-08)
insert into contracts (brand_id, year_month, quota, unit_price)
select id, '2026-08', q, 500000 from brands
  join (values ('abib',5),('naming',4),('amuse',3),('vidivici',2),('whipped',2)) v(n,q) on v.n = brands.name;

-- 배정 (2026-08)
insert into assignments (brand_id, creator_id, year_month, quota)
select b.id, c.id, '2026-08', v.q from
  (values ('abib','hina',2),('abib','merumi',2),('abib','rui',1),('naming','momo',2),('naming','hina',1),
          ('amuse','kyoka',2),('amuse','momo',1),('vidivici','chihiro',1),('vidivici','hina',1),('whipped','rui',1)) v(bn,cn,q)
  join brands b on b.name=v.bn join creators c on c.name=v.cn;

-- 콘텐츠 (일부 · 게시완료)
insert into contents (brand_id, creator_id, product, kind, planned_date, published_at, status, permalink, video_status)
select b.id, c.id, v.product, 'pr', v.planned::date, v.pub::timestamptz, 'uploaded', v.link, 'ready' from
  (values
    ('abib','hina','ヒアルロニックブームセラム','2026-07-14','2026-07-16','https://www.instagram.com/reel/DaSePDuv51z/'),
    ('abib','rui','アビブ ガムシートマスク','2026-08-05','2026-08-07','https://www.instagram.com/reel/DZKjTlaSLHB/'),
    ('naming','momo','over dew glossy lip tint','2026-07-22','2026-07-24','https://www.instagram.com/reel/DbIU1KZvj0p/'),
    ('abib','merumi','아비브 토너패드 8월','2026-08-06','2026-08-08','https://www.instagram.com/reel/Dg2bCdE3fG4/'),
    ('vidivici','chihiro','브이디비디 콜라겐 크림','2026-08-08','2026-08-10','https://www.instagram.com/reel/DdRt5uVn8Kc/')
  ) v(bn,cn,product,planned,pub,link)
  join brands b on b.name=v.bn join creators c on c.name=v.cn;

-- 지표 스냅샷 (콘텐츠별 1건, 확정)
insert into content_metric_snapshots (content_id, views, reach, likes, comments, saved, shares, is_confirmed)
select ct.id, v.views, v.reach, v.likes, v.comments, v.saved, v.shares, true from
  (values
    ('ヒアルロニックブームセラム',125050,86201,2526,8,270,55),
    ('アビブ ガムシートマスク',45228,22899,486,6,41,10),
    ('over dew glossy lip tint',98700,71400,1980,34,212,41),
    ('아비브 토너패드 8월',69200,50100,1290,18,150,22),
    ('브이디비디 콜라겐 크림',31200,24500,720,12,96,15)
  ) v(product,views,reach,likes,comments,saved,shares)
  join contents ct on ct.product=v.product;

-- PR 안건
insert into deals (code,title,client,creator_id,manager,source,type,brief,fee,share_company,share_creator,due_date,upload_date,step)
select v.code,v.title,v.client,c.id,v.mgr,v.src::deal_source,v.typ::deal_type,v.brief,v.fee,v.sc,v.scr,v.due::date,v.up::date,v.step from
  (values
    ('D-102','ロート製薬 스킨케어 PR','ロート製薬','hina','yuta','company_email','ahchannel','신제품 세럼 3주 루틴.',2500000,50,50,'2026-08-18','2026-08-20',5),
    ('D-101','Ray Beams 가을 코디','Ray Beams','momo','mai','company_email','creator','가을 신상 3코디 룩북.',1200000,50,50,'2026-08-25','2026-08-28',4),
    ('D-103','資生堂 신제품 언박싱','資生堂','chihiro','mai','company_email','creator','파운데이션 언박싱+발색.',1800000,50,50,'2026-09-05',null,2),
    ('D-104','コーセー 메이크업 튜토리얼','コーセー','rui','yuta','creator_email','creator','가을 톤 데일리 메이크업.',1500000,60,40,'2026-09-10',null,1)
  ) v(code,title,client,cn,mgr,src,typ,brief,fee,sc,scr,due,up,step)
  join creators c on c.name=v.cn;
