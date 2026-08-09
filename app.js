(function () {
  "use strict";

  var RAW = window.QUIZ_DATA || [];
  // Filter out questions with no marked correct answer or malformed option count (source PDF gaps)
  var QUESTIONS = RAW.filter(function (q) { return q.correct !== null && q.options && q.options.length >= 2; });
  var EXCLUDED = RAW.length - QUESTIONS.length;

  var TOPIC_ORDER = [];
  var byTopic = {};
  QUESTIONS.forEach(function (q) {
    if (!byTopic[q.topic]) { byTopic[q.topic] = []; TOPIC_ORDER.push(q.topic); }
    byTopic[q.topic].push(q);
  });

  var STORE_KEY = 'pdd_ireland_progress_v1';

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) {}
  }
  var progress = loadProgress(); // { [num]: {seen:int, correctStreak:int, lastCorrect:bool} }

  function recordAnswer(num, correct) {
    var e = progress[num] || { seen: 0, correctStreak: 0, lastCorrect: null };
    e.seen += 1;
    e.lastCorrect = correct;
    e.correctStreak = correct ? (e.correctStreak + 1) : 0;
    progress[num] = e;
    saveProgress(progress);
  }

  function isPassed(num) {
    // "passed" = answered correctly the most recent time it was attempted
    var e = progress[num];
    return !!(e && e.lastCorrect === true);
  }
  function isMissed(num) {
    var e = progress[num];
    return !!(e && e.lastCorrect === false);
  }
  function isSeen(num) {
    var e = progress[num];
    return !!(e && e.seen > 0);
  }
  function isMastered(num) {
    // "mastered" = answered correctly 3 times in a row (resets on any wrong answer)
    var e = progress[num];
    return !!(e && e.correctStreak >= 3);
  }

  function topicStats(topicKey) {
    var list = topicKey === '__ALL__' ? QUESTIONS : byTopic[topicKey];
    var passed = 0, missed = 0, seen = 0, mastered = 0;
    list.forEach(function (q) {
      if (isSeen(q.num)) seen++;
      if (isPassed(q.num)) passed++;
      else if (isMissed(q.num)) missed++;
      if (isMastered(q.num)) mastered++;
    });
    return { total: list.length, passed: passed, missed: missed, seen: seen, mastered: mastered };
  }

  // ---------------- Rendering ----------------
  var app = document.getElementById('app');

  var session = null; // { list: [...], idx, score, mode, topicLabel, order:[] }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------------- Navigation (History API) ----------------
  // Every screen transition initiated by a click pushes a history entry.
  // Browser/device back button (and an in-app "← Назад" button that just
  // calls history.back()) then pops it via the popstate handler below,
  // so in-app back and hardware back always stay in sync.

  function goTo(state, renderFn) {
    history.pushState(state, '');
    renderFn();
  }

  window.addEventListener('popstate', function (e) {
    var state = e.state || { screen: 'menu' };
    if (state.screen === 'mode') {
      openModePicker(state.topicKey);
    } else if (state.screen === 'quiz') {
      if (session) { renderQuestion(); } else { renderMenu(); }
    } else if (state.screen === 'results') {
      if (session) { renderResults(); } else { renderMenu(); }
    } else {
      renderMenu();
    }
  });

  function renderMenu() {
    session = null;
    var html = '';
    html += '<div class="plate"><div><h1>ПДД Ірландії</h1><div class="sub">Тренажер · ' + QUESTIONS.length + ' питань</div></div><div class="badge">' + TOPIC_ORDER.length + ' тем</div></div>';

    var overall = topicStats('__ALL__');
    var overallPct = overall.total > 0 ? Math.round((overall.seen / overall.total) * 100) : 0;
    var overallMasteredPct = overall.total > 0 ? Math.round((overall.mastered / overall.total) * 100) : 0;
    html += '<div class="overall-progress">' +
      '<div class="overall-row"><span>Пройдено питань</span><span class="overall-num">' + overall.seen + ' / ' + overall.total + '</span></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + overallPct + '%"></div></div>' +
      '<div class="overall-row overall-sub"><span>З них правильно</span><span class="overall-num good">' + overall.passed + '</span></div>' +
      '<div class="overall-row" style="margin-top:6px;"><span>Засвоєно (3× поспіль)</span><span class="overall-num mastered">' + overall.mastered + ' / ' + overall.total + '</span></div>' +
      '<div class="progress-track"><div class="progress-fill mastered-fill" style="width:' + overallMasteredPct + '%"></div></div>' +
    '</div>';

    html += '<div class="intro">Обери тему нижче — тест буде складатись лише з її питань. Прогрес зберігається на цьому пристрої, тож можна вчити частинами.</div>';

    html += '<div class="topic-grid">';

    var allStats = topicStats('__ALL__');
    html += topicCardHTML('__ALL__', 'Усі теми підряд', allStats);

    TOPIC_ORDER.slice().sort(function (a, b) { return byTopic[b].length - byTopic[a].length; }).forEach(function (t) {
      html += topicCardHTML(t, t, topicStats(t));
    });
    html += '</div>';

    if (EXCLUDED > 0) {
      html += '<div class="note">' + EXCLUDED + ' питання пропущено — у джерельному PDF для них не позначена правильна відповідь.</div>';
    }
    html += '<footer>Дані взято з оригінального PDF · відповіді визначені за виділенням у джерелі</footer>';

    app.innerHTML = html;

    document.querySelectorAll('.topic-card').forEach(function (el) {
      el.addEventListener('click', function () {
        var key = el.getAttribute('data-key');
        goTo({ screen: 'mode', topicKey: key }, function () { openModePicker(key); });
      });
    });
  }

  function topicCardHTML(key, label, stats) {
    var cls = 'topic-card' + (key === '__ALL__' ? ' all' : '');
    var pillCls = 'mastery-pill' + (stats.seen > 0 ? ' has-progress' : '');
    var metaBits = [];
    metaBits.push('<span class="' + pillCls + '">' + stats.seen + '/' + stats.total + ' пройдено</span>');
    if (stats.missed > 0) metaBits.push('<span class="miss-count">' + stats.missed + ' зі помилками</span>');
    return '' +
      '<div class="' + cls + '" data-key="' + esc(key) + '">' +
        '<div class="topic-main">' +
          '<div class="topic-name">' + esc(label) + '</div>' +
          '<div class="topic-meta">' + metaBits.join('') + '</div>' +
        '</div>' +
        '<div class="topic-count">' + stats.total + '</div>' +
      '</div>';
  }

  function openModePicker(topicKey) {
    var label = topicKey === '__ALL__' ? 'Усі теми підряд' : topicKey;
    var list = topicKey === '__ALL__' ? QUESTIONS : byTopic[topicKey];
    var missedList = list.filter(function (q) { return isMissed(q.num); });
    var stats = topicStats(topicKey);

    var html = '';
    html += '<div class="plate"><div><h1>' + esc(label) + '</h1><div class="sub">' + list.length + ' питань у темі</div></div></div>';
    html += '<button class="homebtn" id="backBtn">← До списку тем</button>';
    html += '<div class="overall-progress">' +
      '<div class="overall-row"><span>Прогрес у темі</span><span class="overall-num">' + stats.seen + ' / ' + stats.total + '</span></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + (stats.total ? Math.round(stats.seen / stats.total * 100) : 0) + '%"></div></div>' +
      '<div class="overall-row" style="margin-top:6px;"><span>Засвоєно (3× поспіль)</span><span class="overall-num mastered">' + stats.mastered + ' / ' + stats.total + '</span></div>' +
      '<div class="progress-track"><div class="progress-fill mastered-fill" style="width:' + (stats.total ? Math.round(stats.mastered / stats.total * 100) : 0) + '%"></div></div>' +
    '</div>';
    html += '<div class="topic-grid">';
    html += modeCardHTML('all', 'Пройти всю тему', list.length + ' питань, у випадковому порядку');
    if (missedList.length > 0) {
      html += modeCardHTML('missed', 'Тільки помилки', missedList.length + ' питань, де минулого разу була помилка');
    }
    html += '</div>';
    app.innerHTML = html;

    document.getElementById('backBtn').addEventListener('click', function () { history.back(); });
    document.querySelectorAll('.topic-card').forEach(function (el) {
      el.addEventListener('click', function () {
        var mode = el.getAttribute('data-mode');
        var pool = mode === 'missed' ? missedList : list;
        goTo({ screen: 'quiz', topicKey: topicKey, label: label }, function () { startSession(pool, label); });
      });
    });
  }

  function modeCardHTML(mode, title, sub) {
    return '' +
      '<div class="topic-card" data-mode="' + mode + '">' +
        '<div class="topic-main">' +
          '<div class="topic-name">' + esc(title) + '</div>' +
          '<div class="topic-meta">' + esc(sub) + '</div>' +
        '</div>' +
      '</div>';
  }

  function startSession(pool, label) {
    session = {
      list: shuffle(pool),
      idx: 0,
      score: 0,
      answered: false,
      topicLabel: label,
      missedThisRun: []
    };
    renderQuestion();
  }

  function currentQuestionView(q) {
    // shuffle option order, remap correct index
    var idxs = shuffle(q.options.map(function (_, i) { return i; }));
    return {
      q: q,
      order: idxs,
      correctPos: idxs.indexOf(q.correct)
    };
  }

  function renderQuestion() {
    var q = session.list[session.idx];
    var view = currentQuestionView(q);
    session.currentView = view;
    session.answered = false;

    var total = session.list.length;
    var pct = Math.round((session.idx / total) * 100);

    var html = '';
    html += '<div class="plate"><div><h1>' + esc(session.topicLabel) + '</h1><div class="sub">Питання ' + (session.idx + 1) + ' з ' + total + '</div></div><button class="homebtn" id="quitBtn" style="text-decoration:none;">← Назад</button></div>';

    html += '<div class="quiz-header">' +
      '<span class="progress-label">' + (session.idx + 1) + '/' + total + '</span>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="score-label">✓ ' + session.score + '</span>' +
    '</div>';

    html += '<div class="qcard">';
    html += '<div class="qnum">Питання № ' + q.num + '</div>';
    html += '<div class="qtext">' + esc(q.text) + '</div>';
    if (q.img) {
      html += '<div class="qimg-wrap"><img src="' + q.img + '" alt="Зображення до питання"></div>';
    }
    html += '<div class="options" id="optsWrap">';
    view.order.forEach(function (origIdx, pos) {
      html += '<button class="opt" data-pos="' + pos + '"><span class="mark"></span><span>' + esc(q.options[origIdx]) + '</span></button>';
    });
    html += '</div>';
    html += '<div class="feedback" id="feedback"></div>';
    html += '<div id="explWrap"></div>';
    html += '<button class="btn btn-ghost btn-expl" id="explBtn" type="button">Чому це правильно? 💡</button>';
    html += '</div>';

    html += '<div class="nextbar"><button class="btn btn-primary" id="nextBtn" disabled>Далі →</button></div>';

    app.innerHTML = html;

    document.getElementById('quitBtn').addEventListener('click', function () { history.back(); });
    document.querySelectorAll('#optsWrap .opt').forEach(function (btn) {
      btn.addEventListener('click', function () { onAnswer(parseInt(btn.getAttribute('data-pos'), 10)); });
    });
    document.getElementById('nextBtn').addEventListener('click', onNext);
    document.getElementById('explBtn').addEventListener('click', function () { toggleExplanation(q); });
  }

  function explanationHTML(q) {
    var html = '<div class="expl-box">' +
        '<div class="expl-title">Логіка правила</div>' +
        '<div class="expl-body">' + esc(q.expl) + '</div>';
    if (q.explSpecific) {
      html += '<div class="expl-title expl-title-2">Чому саме ця відповідь</div>' +
        '<div class="expl-body">' + esc(q.explSpecific) + '</div>';
    }
    html += '<div class="expl-answer">Правильна відповідь: ' + esc(q.options[q.correct]) + '</div>' +
      '</div>';
    return html;
  }

  function toggleExplanation(q) {
    var wrap = document.getElementById('explWrap');
    if (wrap.dataset.open === '1') {
      wrap.innerHTML = '';
      wrap.dataset.open = '0';
    } else {
      wrap.innerHTML = explanationHTML(q);
      wrap.dataset.open = '1';
    }
  }

  function onAnswer(pos) {
    if (session.answered) return;
    session.answered = true;
    var view = session.currentView;
    var q = view.q;
    var correct = pos === view.correctPos;

    if (correct) session.score++;
    else session.missedThisRun.push(q);

    recordAnswer(q.num, correct);

    var buttons = document.querySelectorAll('#optsWrap .opt');
    buttons.forEach(function (btn, i) {
      btn.classList.add('locked');
      if (i === view.correctPos) btn.classList.add('correct');
      else if (i === pos) btn.classList.add('wrong');
      else btn.classList.add('dim');
    });

    var fb = document.getElementById('feedback');
    if (correct) {
      fb.textContent = 'Правильно!';
      fb.className = 'feedback good';
    } else {
      fb.textContent = 'Неправильно. Правильна відповідь виділена зеленим.';
      fb.className = 'feedback bad';
      var wrap = document.getElementById('explWrap');
      wrap.innerHTML = explanationHTML(q);
      wrap.dataset.open = '1';
    }

    document.getElementById('nextBtn').disabled = false;
  }

  function onNext() {
    session.idx++;
    if (session.idx >= session.list.length) {
      // Collapse the quiz history entry into the results entry, so pressing
      // back from results returns to the mode picker (not to the finished quiz).
      history.replaceState({ screen: 'results' }, '');
      renderResults();
    } else {
      renderQuestion();
    }
  }

  function renderResults() {
    var total = session.list.length;
    var pct = total > 0 ? Math.round((session.score / total) * 100) : 0;

    var html = '';
    html += '<div class="plate"><div><h1>Результат</h1><div class="sub">' + esc(session.topicLabel) + '</div></div></div>';
    html += '<div class="result-card">';
    html += '<div class="result-big">' + session.score + ' / ' + total + '</div>';
    html += '<div class="result-sub">' + pct + '% правильних відповідей</div>';
    html += '<div class="result-actions">';
    html += '<button class="btn btn-primary" id="retryBtn">Повторити цю ж тему</button>';
    if (session.missedThisRun.length > 0) {
      html += '<button class="btn btn-ghost" id="retryMissedBtn">Повторити тільки помилки (' + session.missedThisRun.length + ')</button>';
    }
    html += '<button class="btn btn-ghost" id="menuBtn">До списку тем</button>';
    html += '</div>';
    html += '</div>';

    if (session.missedThisRun.length > 0) {
      html += '<div class="intro">Питання, де була помилка цього разу:</div>';
      html += '<div class="missed-list">';
      session.missedThisRun.forEach(function (q) {
        html += '<div class="missed-item"><div class="mnum">№ ' + q.num + '</div>' + esc(q.text) + '<div class="manswer">✓ ' + esc(q.options[q.correct]) + '</div></div>';
      });
      html += '</div>';
    }

    app.innerHTML = html;

    var origList = session.list.slice();
    var missedPool = session.missedThisRun.slice();
    var label = session.topicLabel;

    document.getElementById('retryBtn').addEventListener('click', function () {
      goTo({ screen: 'quiz', label: label }, function () { startSession(origList, label); });
    });
    var mb = document.getElementById('retryMissedBtn');
    if (mb) mb.addEventListener('click', function () {
      goTo({ screen: 'quiz', label: label }, function () { startSession(missedPool, label); });
    });
    document.getElementById('menuBtn').addEventListener('click', function () {
      goTo({ screen: 'menu' }, renderMenu);
    });
  }

  // ---------------- Bootstrap ----------------
  history.replaceState({ screen: 'menu' }, '');
  renderMenu();
})();
