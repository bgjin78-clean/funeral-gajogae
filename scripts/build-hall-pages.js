const fs = require("fs");
const https = require("https");
const path = require("path");

const root = path.join(__dirname, "..");
const cachePath = path.join(root, "data", "ehaneul-fees.json");
const BASE = 390000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function loadHalls() {
  const src = fs.readFileSync(path.join(root, "js", "halls-data.js"), "utf8");
  global.window = {};
  eval(src.replace("window.HALLS", "global.HALLS"));
  return global.HALLS;
}

function request(method, url, body, headers) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const req = https.request({
      method: method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: Object.assign({
        "User-Agent": UA,
        Accept: "application/json,text/plain,*/*",
        "X-Requested-With": "XMLHttpRequest"
      }, headers || {})
    }, function (res) {
      const chunks = [];
      res.on("data", function (chunk) { chunks.push(chunk); });
      res.on("end", function () {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(25000, function () { req.destroy(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

function cookieHeader(res) {
  const raw = res.headers["set-cookie"] || [];
  return raw.map(function (item) { return item.split(";")[0]; }).join("; ");
}

async function fetchFacilities(cookie) {
  const sido = ["2600000000", "4800000000"];
  const all = [];
  for (const code of sido) {
    const body = "pageInqCnt=300&curPageNo=1&sidocd=" + code + "&gungucd=&companyname=&facilitygroupcd=TBC0700001&publiccode=";
    const res = await request("POST", "https://15774129.go.kr/portal/fnlfac/fac_list.ajax", body, {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: cookie,
      Referer: "https://15774129.go.kr/portal/esky/fnlfac/fac_list.do"
    });
    const json = JSON.parse(res.body);
    if (!json.list) throw new Error("facility list failed " + code);
    all.push.apply(all, json.list);
  }
  return all;
}

function slim(row, kind) {
  if (kind === "item") {
    return {
      group: row.tier1Nm || "",
      sub: row.tier2Nm || "",
      name: row.commodity || "",
      unit: row.etcinfo || "",
      amt: Number(row.commamt) || 0,
      sale: row.sale || ""
    };
  }
  return {
    group: row.tier1Nm || "",
    sub: row.tier2Nm || "",
    name: row.item || "",
    unit: kind === "comm" ? (row.servcontent || "") : (row.rentcontent || ""),
    amt: Number(row.facilityamt) || 0,
    sale: row.sale || ""
  };
}

async function fetchPrice(facility, cookie) {
  const body = "facilitycd=" + encodeURIComponent(facility.facilitycd) + "&sanbundiv=" + encodeURIComponent(facility.sanbundiv || "N");
  const res = await request("POST", "https://15774129.go.kr/portal/fnlfac/price_info.ajax", body, {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Cookie: cookie,
    Referer: "https://15774129.go.kr/portal/esky/fnlfac/fac_view.do"
  });
  const json = JSON.parse(res.body);
  if (!json.isSuccess) throw new Error(json.errorMessage || "price failed");
  return {
    name: facility.companyname,
    address: facility.fulladdress || "",
    phone: facility.telephone || "",
    date: (json.detail && json.detail.priceitemdate) || "",
    rows: []
      .concat((json.hallRent || []).map(function (row) { return slim(row, "rent"); }))
      .concat((json.commission || []).map(function (row) { return slim(row, "comm"); }))
      .concat((json.funeralItem || []).map(function (row) { return slim(row, "item"); }))
  };
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: size }, run));
  return out;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function compact(value) {
  return String(value || "")
    .replace(/\(주\)|주식회사|유한회사|의료재단|재단법인/g, "")
    .replace(/\s+/g, "")
    .replace(/장례식장/g, "")
    .replace(/[()（）·,.\-]/g, "")
    .toLowerCase();
}

function roadKey(value) {
  const match = String(value || "").match(/([가-힣0-9]+(?:로|길|대로))\s*(\d+(?:-\d+)?)/);
  return match ? match[1] + match[2] : "";
}

function matchFacility(hall, facilities) {
  const name = compact(hall.name);
  const phone = digits(hall.phone);
  const road = roadKey(hall.address);
  let best = null;
  let bestScore = 0;
  facilities.forEach(function (facility) {
    const other = compact(facility.companyname);
    const exactName = name && other && name === other;
    const nameHit = exactName || (name && other && (name.includes(other) || other.includes(name)));
    const phoneHit = phone && phone === digits(facility.telephone);
    const roadHit = road && road === roadKey(facility.fulladdress);
    if (!(exactName || (nameHit && (phoneHit || roadHit)) || phoneHit || roadHit)) return;
    let score = 0;
    if (exactName) score += 100;
    else if (nameHit) score += 70;
    if (phoneHit) score += 60;
    if (roadHit) score += 80;
    if (score > bestScore) {
      best = facility;
      bestScore = score;
    }
  });
  return best;
}

function usable(row) {
  return row && row.sale !== "N" && row.amt > 0;
}

function textOf(row) {
  return [row.group, row.sub, row.name, row.unit].join(" ");
}

function notHourly(row) {
  return !/시간당/.test(row.unit || "");
}

function withoutSpecial(rows) {
  const normal = rows.filter(function (row) { return !/감염/.test(textOf(row)); });
  return normal.length ? normal : rows;
}

function isDailyFee(row) {
  return /1일|1박|일당/.test(textOf(row));
}

function pick(rows, test) {
  return rows.filter(function (row) { return usable(row) && test(row); });
}

function rangeOf(rows) {
  if (!rows.length) return null;
  const amounts = rows.map(function (row) { return row.amt; });
  return { min: Math.min.apply(null, amounts), max: Math.max.apply(null, amounts) };
}

function scale(range, days) {
  if (!range) return null;
  return { min: range.min * days, max: range.max * days };
}

function add(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { min: a.min + b.min, max: a.max + b.max };
}

function feesFrom(record) {
  const rows = (record && record.rows) || [];
  const anchi = withoutSpecial(pick(rows, function (row) {
    return /안치/.test(textOf(row)) && notHourly(row) && !/용품/.test(textOf(row));
  }));
  const sushi = withoutSpecial(pick(rows, function (row) {
    return /수시/.test(row.group || "") && notHourly(row);
  }));
  let room = withoutSpecial(pick(rows, function (row) {
    return row.group === "시설임대료" && /입관실|염습실/.test(textOf(row)) && notHourly(row);
  }));
  const roomNamed = room.filter(function (row) { return /입관/.test(row.name || ""); });
  if (roomNamed.length) room = roomNamed;
  let trash = pick(rows, function (row) { return /쓰레기/.test(textOf(row)); });
  if (!trash.length) trash = pick(rows, function (row) { return /폐기물/.test(textOf(row)) && !/감염/.test(textOf(row)); });
  const binso = withoutSpecial(pick(rows, function (row) {
    const text = textOf(row);
    if (!notHourly(row) || /용품|위패|혼백|방명록|양초/.test(text)) return false;
    return /빈소\+접객실|빈소사용|빈소임대|분향실/.test(text);
  }));
  return {
    date: record ? record.date : "",
    anchi: anchi,
    sushi: sushi,
    room: room,
    trash: trash,
    binso: binso
  };
}

function won(value) {
  return Number(value).toLocaleString("ko-KR") + "원";
}

function wonRange(range) {
  if (!range) return "";
  if (range.min === range.max) return won(range.min);
  return won(range.min) + " ~ " + won(range.max);
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

function fileName(hall, region, duplicate) {
  const base = duplicate ? region.name + "-" + hall.name : hall.name;
  return String(base).replace(/[\\/:*?"<>|]/g, "") + ".html";
}

function pyeong(row) {
  const match = textOf(row).match(/(\d+(?:\.\d+)?)\s*평/);
  return match ? match[1] + "평" : "—";
}

function labelOf(row) {
  const bits = [row.name, row.sub, row.unit].filter(function (bit) {
    return bit && bit !== "-" && bit !== "null";
  });
  return bits.join(" · ") || row.group || "항목";
}

function feeRows(title, rows, multiplier) {
  if (!rows.length) return "";
  return rows.map(function (row) {
    const amount = row.amt * (multiplier || 1);
    return "<tr><td>" + esc(title) + "</td><td>" + esc(labelOf(row)) + "</td><td>" + won(amount) + "</td></tr>";
  }).join("");
}

function shell(options) {
  const onFamily = options.kind === "family" ? " on" : "";
  const onMubinso = options.kind === "mubinso" ? " on" : "";
  return "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>" + esc(options.title) + "</title>\n<meta name=\"description\" content=\"" + esc(options.description) + "\">\n<link rel=\"canonical\" href=\"" + esc(options.canonical) + "\">\n<link rel=\"icon\" href=\"../favicon.ico\" sizes=\"any\">\n<link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"../images/favicon.png\">\n<link rel=\"apple-touch-icon\" href=\"../images/apple-touch-icon.png\">\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@600;700&display=swap\" rel=\"stylesheet\">\n<link rel=\"stylesheet\" href=\"../css/style.css\">\n</head>\n<body>\n<header class=\"site-header\">\n  <div class=\"topbar\"><div class=\"wrap topbar-inner\"><p>규모를 정하지 못했어도 전화로 비교해 보실 수 있습니다.</p><a href=\"tel:01066413895\">대표번호 1566-2505</a></div></div>\n  <div class=\"wrap head-main\">\n    <a class=\"logo\" href=\"../index.html\"><img src=\"../images/logo.png\" alt=\"\"><span>가족애 상조</span></a>\n    <button class=\"nav-toggle\" type=\"button\" aria-expanded=\"false\">메뉴</button>\n    <a class=\"head-call\" href=\"tel:01066413895\"><small>24시간 상담</small><b>1566-2505</b></a>\n  </div>\n  <nav class=\"wrap nav-row\" aria-label=\"주요 메뉴\">\n    <a href=\"../service.html\">후불제 장례 서비스</a>\n    <a href=\"../guide.html\">장례절차/가이드</a>\n    <a class=\"" + onFamily.trim() + "\" href=\"../family.html\">가족장</a>\n    <a class=\"" + onMubinso.trim() + "\" href=\"../mubinso.html\">무빈소장례</a>\n    <a href=\"../halls.html\">장례식장정보</a>\n    <a href=\"../contact.html\">장례무료상담</a>\n    <a href=\"../reviews.html\">장례후기</a>\n  </nav>\n</header>\n<main class=\"prose\">\n" + options.body + "\n</main>\n<footer class=\"site-footer\">\n  <div class=\"wrap foot-grid\">\n    <div><h2><a class=\"foot-logo\" href=\"../index.html\"><img src=\"../images/logo.png\" alt=\"\"><span>가족애 상조</span></a></h2><p>허례허식 없이, 진심만 담은 후불제 장례. 39만원부터.</p><p style=\"margin-top:12px\">대표번호 <a href=\"tel:01066413895\">1566-2505</a></p><p>메일 <a href=\"mailto:bg.jin78@gmail.com\">bg.jin78@gmail.com</a></p></div>\n    <div><h2>메뉴</h2><p><a href=\"../service.html\">후불제 장례 서비스</a></p><p><a href=\"../guide.html\">장례절차/가이드</a></p><p><a href=\"../family.html\">가족장</a></p><p><a href=\"../mubinso.html\">무빈소장례</a></p><p><a href=\"../halls.html\">장례식장정보</a></p><p><a href=\"../contact.html\">장례무료상담</a></p><p><a href=\"../reviews.html\">장례후기</a></p></div>\n    <div class=\"biz\"><h2>사업자 정보</h2><p>상호 가족애</p><p>대표 옥현호</p><p>사업자등록번호 407-93-09000</p><p>업태 서비스업 / 종목 장의</p><p>경상남도 창원시 성산구 신촌로 79, A동 508호 (신촌동, 형진빌라아파트)</p></div>\n  </div>\n  <div class=\"wrap legal\"><p>시설 요금은 e하늘 장사정보시스템 공개 가격입니다. 실제 요금은 장례식장에 확인해 주세요.</p><p>© 가족애 장례</p></div>\n</footer>\n<div class=\"dock\"><a class=\"dock-call\" href=\"tel:01066413895\">전화 1566-2505</a><a class=\"dock-kakao\" href=\"#\" data-kakao>카카오톡 문의</a></div>\n<script src=\"../js/main.js\"></script>\n</body>\n</html>\n";
}

function pageBody(hall, region, kind, fees, meta) {
  const titleName = meta.titleName;
  const keyword = titleName + (kind === "family" ? " 가족장" : " 무빈소장례");
  const sibling = kind === "family" ? "mubinso" : "family";
  const siblingLabel = kind === "family" ? "무빈소장례" : "가족장";
  const anchiDaily = fees.anchi.filter(isDailyFee);
  const anchiFlat = fees.anchi.filter(function (row) { return !isDailyFee(row); });
  const anchi = add(scale(rangeOf(anchiDaily), 2), rangeOf(anchiFlat));
  const sushi = rangeOf(fees.sushi);
  const room = rangeOf(fees.room);
  const trash = rangeOf(fees.trash);
  const binso = rangeOf(fees.binso);
  const binso2 = scale(binso, 2);
  const facility = [anchi, sushi, room, trash].reduce(add, null);
  const withBinso = add(facility, binso2);
  const hallCost = kind === "family" ? withBinso : facility;
  const total = hallCost ? { min: hallCost.min + BASE, max: hallCost.max + BASE } : null;
  const roomCount = hall.rooms || (fees.binso.length ? String(fees.binso.length) : "");
  const binsoCaption = kind === "mubinso"
    ? "빈소 사용료" + (roomCount ? " (총 " + roomCount + "실, 무빈소는 들지 않음)" : " (무빈소는 들지 않음)")
    : "빈소 사용료" + (roomCount ? " (총 " + roomCount + "실, 가족장 2일에 포함)" : " (가족장 2일에 포함)");
  const facilityCaption = kind === "mubinso" ? "무빈소에도 드는 시설 이용료" : "가족장에도 드는 시설 이용료";
  const parts = [];
  if (anchi) parts.push("안치");
  if (sushi) parts.push("수시비");
  if (room) parts.push("입관실");
  if (trash) parts.push("쓰레기 수거료");
  if (kind === "family" && binso2) parts.push("빈소 2일");
  const explain = parts.length
    ? parts.join(", ") + "을 더한 금액입니다. 같은 항목에 여러 요금이 있으면 낮은 금액부터 높은 금액까지 범위로 적었습니다."
    : "이 장례식장의 공개 이용료에서 합산할 항목을 찾지 못했습니다. 시설 실비는 상담에서 해당 식장 기준으로 안내합니다.";
  let pill = "";
  if (kind === "mubinso" && binso2) {
    pill = "<p class=\"save-pill\">가족장 대비 빈소 2일 사용료 " + wonRange(binso2) + " 절감</p>";
  } else if (kind === "family" && binso2) {
    pill = "<p class=\"save-pill\">무빈소에는 없는 빈소 2일 사용료 " + wonRange(binso2) + "이 포함됩니다</p>";
  }
  const totalText = total ? wonRange(total) : won(BASE) + " + 시설 실비";
  const hallText = hallCost ? wonRange(hallCost) : "공개 요금 확인 필요";
  const phone = hall.phone ? "<a href=\"tel:" + digits(hall.phone) + "\">" + esc(hall.phone) + "</a>" : "전화 확인";
  const facts = [esc(hall.address), "연락처 " + phone];
  if (hall.rooms) facts.push("빈소 " + esc(hall.rooms) + "실");
  if (hall.parking) facts.push("주차 " + esc(hall.parking) + "대");
  facts.push(esc(region.name) + " · " + esc(hall.kind || ""));

  const facilityTable = [
    feeRows("안치료 (1일)", anchiDaily, 1),
    feeRows("안치료 (2일)", anchiDaily, 2),
    feeRows("안치료", anchiFlat, 1),
    feeRows("수시비 (고인 수습)", fees.sushi, 1),
    feeRows("입관실 사용료", fees.room, 1),
    feeRows("쓰레기 수거료", fees.trash, 1)
  ].join("");
  const binsoTable = fees.binso.map(function (row) {
    return "<tr><td>" + esc(labelOf(row)) + "</td><td>" + esc(pyeong(row)) + "</td><td>" + won(row.amt) + "</td></tr>";
  }).join("");
  const dateNote = fees.date ? " 가격 공개일 " + fees.date + "." : "";

  return "  <section class=\"page-hero\">\n    <div class=\"wrap\">\n      <p><a href=\"../" + (kind === "family" ? "family" : "mubinso") + ".html\">" + (kind === "family" ? "가족장" : "무빈소장례") + "</a></p>\n      <h1>" + esc(keyword) + "</h1>\n      <p>" + esc(hall.name) + "에서 " + (kind === "family" ? "가까운 가족과 작은 빈소로 진행하는 가족장" : "조문실 없이 안치, 입관, 발인으로 진행하는 무빈소장례") + " 비용입니다. " + facts.join(" · ") + "</p>\n    </div>\n  </section>\n  <section>\n    <div class=\"wrap\">\n      <h2>" + esc(titleName) + " 시설 이용료와 빈소 사용료</h2>\n      <h3>" + facilityCaption + "</h3>\n      " + (facilityTable
        ? "<div style=\"overflow-x:auto\"><table class=\"compare\"><thead><tr><th>항목</th><th>기준</th><th>요금</th></tr></thead><tbody>" + facilityTable + "</tbody></table></div>"
        : "<p>안치료, 수시비, 입관실 사용료, 쓰레기 수거료의 공개 금액을 이 장례식장 자료에서 찾지 못했습니다.</p>") + "\n      <h3>" + binsoCaption + "</h3>\n      " + (binsoTable
        ? "<div style=\"overflow-x:auto\"><table class=\"compare\"><thead><tr><th>빈소</th><th>평형</th><th>1일 사용료</th></tr></thead><tbody>" + binsoTable + "</tbody></table></div>"
        : "<p>공개된 빈소 1일 사용료가 없습니다.</p>") + "\n      <p class=\"fee-note\">* e하늘 장사정보시스템 공개 가격 기준이며, 실제 요금은 장례식장에 확인해 주세요." + esc(dateNote) + "</p>\n      <h2>" + esc(titleName) + (kind === "family" ? " 가족장 총비용" : " 무빈소 총비용") + "</h2>\n      <p class=\"cost-range\">" + totalText + "</p>\n      " + pill + "\n      <div class=\"cost-grid\">\n        <article class=\"cost-card\">\n          <h3>장례식장 비용</h3>\n          <p class=\"sum\">" + hallText + "</p>\n          <p>" + explain + " 식사와 제단, 화장·봉안은 이 합계에 넣지 않았습니다.</p>\n        </article>\n        <article class=\"cost-card product\">\n          <h3>가족애 기본 상품</h3>\n          <p class=\"sum\">390,000원</p>\n          <p>지역과 장례식장과 관계없이 동일합니다.</p>\n          <ul class=\"check-list\">\n            <li>오동나무관, 전통 수의, 입관용품 25가지</li>\n            <li>화장 예약 대행과 부고 문자</li>\n            <li>가입비와 월 납입금 없음</li>\n            <li>장례지도사, 도우미, 차량은 필요한 것만 선택</li>\n          </ul>\n          <p style=\"margin-top:12px\"><a href=\"../service.html#estimate\">기본 상품 구성 자세히 보기</a></p>\n        </article>\n      </div>\n      <p class=\"fee-note\">* 안치실 사정에 따라 " + (kind === "mubinso" ? "무빈소" : "가족장") + " 진행이 어려울 수 있어 상담에서 먼저 확인해 드립니다.</p>\n      <p class=\"fee-note\">* 총비용은 위 시설 이용료와 가족애 기본 상품 39만원을 더한 참고 금액입니다. 선택 항목과 식대, 화장·봉안은 따로입니다.</p>\n      <a class=\"btn btn-navy btn-block\" href=\"../" + (kind === "family" ? "family" : "mubinso") + ".html\">" + (kind === "family" ? "가족장" : "무빈소장례") + " 절차 자세히 보기</a>\n      <div class=\"btn-row\">\n        <a class=\"btn btn-gold\" href=\"tel:01066413895\">1566-2505</a>\n        <a class=\"btn btn-navy\" href=\"../" + sibling + "/" + encodeURIComponent(fileName(hall, region, meta.duplicate)) + "\">" + esc(titleName) + " " + siblingLabel + "</a>\n        <a class=\"btn btn-line\" href=\"../halls.html\" style=\"color:var(--navy);border-color:var(--line)\">장례식장 목록</a>\n      </div>\n    </div>\n  </section>";
}

function guideHtml(entries, kind) {
  const groups = [
    { title: "경상남도 시", test: function (item) { return item.parent === "gyeongnam" && item.type === "시"; } },
    { title: "경상남도 군", test: function (item) { return item.parent === "gyeongnam" && item.type === "군"; } },
    { title: "부산광역시", test: function (item) { return item.parent === "busan"; } }
  ];
  return groups.map(function (group) {
    const links = entries.filter(function (entry) { return group.test(entry.region); }).map(function (entry) {
      const href = kind + "/" + encodeURIComponent(fileName(entry.hall, entry.region, entry.duplicate));
      const text = entry.titleName + (kind === "family" ? " 가족장" : " 무빈소장례");
      return "<a class=\"chip\" href=\"" + href + "\">" + esc(text) + "</a>";
    }).join("");
    return "<h3 class=\"region-label\">" + group.title + "</h3><div class=\"filters\">" + links + "</div>";
  }).join("\n");
}

function inject(file, html) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("<!-- HALL_GUIDES -->") || !source.includes("<!-- /HALL_GUIDES -->")) {
    throw new Error("marker missing in " + file);
  }
  const next = source.replace(/<!-- HALL_GUIDES -->[\s\S]*?<!-- \/HALL_GUIDES -->/, "<!-- HALL_GUIDES -->\n" + html + "\n      <!-- /HALL_GUIDES -->");
  fs.writeFileSync(file, next);
}

function updateSitemap(urls) {
  const file = path.join(root, "sitemap.xml");
  let xml = fs.readFileSync(file, "utf8");
  xml = xml.replace(/<loc>https:\/\/main\.gajogaefuneral\.com\/(family|mubinso)\.html<\/loc>\s*<lastmod>[^<]+<\/lastmod>/g, function (all, name) {
    return "<loc>https://main.gajogaefuneral.com/" + name + ".html</loc>\n    <lastmod>2026-10-19</lastmod>";
  });
  xml = xml.replace(/\s*<url>\s*<loc>https:\/\/main\.gajogaefuneral\.com\/(?:family|mubinso)\/[^<]+<\/loc>[\s\S]*?<\/url>/g, "");
  const block = urls.map(function (url) {
    return "  <url>\n    <loc>" + url + "</loc>\n    <lastmod>2026-10-19</lastmod>\n  </url>";
  }).join("\n");
  xml = xml.replace("</urlset>", block + "\n</urlset>");
  fs.writeFileSync(file, xml);
}

async function main() {
  const halls = loadHalls();
  const flat = [];
  halls.forEach(function (region) {
    region.halls.forEach(function (hall) { flat.push({ region: region, hall: hall }); });
  });
  const counts = {};
  flat.forEach(function (entry) { counts[entry.hall.name] = (counts[entry.hall.name] || 0) + 1; });
  flat.forEach(function (entry) {
    entry.duplicate = counts[entry.hall.name] > 1;
    const area = String(entry.region.name).replace(/(특별시|광역시|시|군|구)$/, "");
    entry.titleName = entry.duplicate ? area + " " + entry.hall.name : entry.hall.name;
  });
  const refresh = process.argv.indexOf("--refresh") !== -1;
  let priced = {};
  if (!refresh && fs.existsSync(cachePath)) {
    priced = JSON.parse(fs.readFileSync(cachePath, "utf8")).byCode || {};
  }
  const home = await request("GET", "https://15774129.go.kr/portal/esky/fnlfac/fac_list.do", null, { Referer: "https://15774129.go.kr/" });
  const cookie = cookieHeader(home);
  const facilities = await fetchFacilities(cookie);
  const missing = [];
  const jobs = [];
  flat.forEach(function (entry) {
    const facility = matchFacility(entry.hall, facilities);
    entry.facility = facility;
    if (!facility) missing.push(entry.hall.name);
    else if (!priced[facility.facilitycd]) jobs.push(facility);
  });
  console.log("halls", flat.length, "matched", flat.length - missing.length, "to fetch", jobs.length);
  if (missing.length) console.log("unmatched", missing.join(", "));
  await pool(jobs, 4, async function (facility, index) {
    try {
      priced[facility.facilitycd] = await fetchPrice(facility, cookie);
    } catch (error) {
      console.log("price fail", facility.companyname, error.message);
    }
    if ((index + 1) % 20 === 0) console.log("fetched", index + 1, "/", jobs.length);
  });
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ byCode: priced }));

  ["family", "mubinso"].forEach(function (dir) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  });
  const urls = [];
  flat.forEach(function (entry) {
    const record = entry.facility ? priced[entry.facility.facilitycd] : null;
    const fees = feesFrom(record);
    ["family", "mubinso"].forEach(function (kind) {
      const keyword = entry.titleName + (kind === "family" ? " 가족장" : " 무빈소장례");
      const file = fileName(entry.hall, entry.region, entry.duplicate);
      const canonical = "https://main.gajogaefuneral.com/" + kind + "/" + encodeURIComponent(file);
      const description = keyword + " 비용. " + entry.hall.address + " 시설 이용료, 빈소 사용료, 가족애 39만원 기본 상품을 함께 안내합니다.";
      const html = shell({
        kind: kind,
        title: keyword + " | 가족애 장례",
        description: description,
        canonical: canonical,
        body: pageBody(entry.hall, entry.region, kind, fees, entry)
      });
      fs.writeFileSync(path.join(root, kind, file), html);
      urls.push(canonical.replace(/&/g, "&amp;"));
    });
  });
  inject(path.join(root, "family.html"), guideHtml(flat, "family"));
  inject(path.join(root, "mubinso.html"), guideHtml(flat, "mubinso"));
  updateSitemap(urls);
  console.log("pages", urls.length);
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
