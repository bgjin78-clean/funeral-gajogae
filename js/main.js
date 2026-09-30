(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav-row");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var KAKAO_URL = "";
  document.querySelectorAll("[data-kakao]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (!KAKAO_URL) {
        event.preventDefault();
        showToast("카카오톡 문의 버튼은 준비되어 있습니다. 연결 링크는 전달받는 대로 넣겠습니다. 급한 문의는 1566-2505로 전화 주세요.");
        return;
      }
      link.setAttribute("href", KAKAO_URL);
    });
  });

  function showToast(message) {
    var old = document.querySelector(".toast");
    if (old) old.remove();
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4200);
  }

  if (window.emailjs) {
    emailjs.init("JKsVOKPtnWHIr2BCV");
  }

  document.querySelectorAll("form[data-mail]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var button = form.querySelector("button[type='submit']");
      var original = button.textContent;
      button.disabled = true;
      button.textContent = "보내는 중...";

      var kind = form.getAttribute("data-mail");
      var title = kind === "review" ? "[가족애 장례] 후기 접수" : "[가족애 장례] 상담접수";
      var lines = [];
      form.querySelectorAll("input, select, textarea").forEach(function (field) {
        if (!field.name || field.type === "checkbox") return;
        lines.push(field.name + ": " + (field.value || ""));
      });

      emailjs.send("gajogae-yupum", "template_wwbariw", {
        title: title,
        site_name: "가족애 장례",
        name: (form.querySelector("[name='이름']") || {}).value || "",
        email: "bg.jin78@gmail.com",
        message: "접수 사이트: 가족애 장례\n\n" + lines.join("\n") + "\n\n접수 페이지:\n" + window.location.href
      }).then(function () {
        alert(kind === "review" ? "후기가 접수되었습니다. 확인 후 연락드리겠습니다." : "상담 접수가 완료되었습니다. 확인 후 연락드리겠습니다.");
        form.reset();
      }).catch(function () {
        alert("전송 중 오류가 발생했습니다. 1566-2505로 전화 주세요.");
      }).finally(function () {
        button.disabled = false;
        button.textContent = original;
      });
    });
  });
})();
