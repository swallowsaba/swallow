/* ============================================================
   統合レッスン用 トレーニング素材
   - これまでレッスンに無かったスキルを4択問題として供給する。
   - summary    : 要約力（英文→最も適切な要約を選ぶ）
   - paraphrase : パラフレーズ（同義の言い換えを選ぶ）
   - intensive  : 精読・英文解釈（下線部/文の正確な解釈を選ぶ）
   - question   : 質問力（場面に合う適切な質問文を選ぶ）
   - response   : 即答力（相手の発話に対する自然な応答を選ぶ）
   - extensive  : 多読（短いパッセージの内容一致を選ぶ）
   各 level は CEFR。choices の先頭が正解（出題時にシャッフルする）。
   ============================================================ */
window.EigoData = window.EigoData || {};
window.EigoData.trainingItems = [

  /* ---------------- 要約力 Summarization ---------------- */
  { type: "summary", level: "B1",
    text: "The team finished the first version of the app and started testing it. The client gave helpful feedback, so we are now fixing a few small issues before release.",
    q: "この文の要約として最も適切なものは？",
    choices: [
      "アプリの初版が完成し、顧客の意見をもとに修正中である。",
      "アプリの開発はまだ始まっておらず、計画段階である。",
      "顧客がアプリに不満で、開発が中止された。",
      "アプリはすでに公開され、好評を得ている。"
    ],
    explain: "完成→テスト→顧客フィードバック→修正、という流れ。中心は『初版完成と修正中』。" },
  { type: "summary", level: "B2",
    text: "Although sales rose this quarter, our profit margin shrank because shipping costs increased sharply. We need to renegotiate carrier contracts to protect margins.",
    q: "最も適切な要約は？",
    choices: [
      "売上は伸びたが輸送費増で利益率が低下し、配送契約の再交渉が必要。",
      "売上も利益も大きく伸び、追加投資を検討している。",
      "売上が落ち込み、従業員を削減する必要がある。",
      "輸送費が下がったため利益率が改善した。"
    ],
    explain: "譲歩のAlthoughが鍵。『売上増だが輸送費で利益率減→契約再交渉』が骨子。" },
  { type: "summary", level: "B2",
    text: "The new policy lets employees work remotely three days a week. Early data shows higher satisfaction and no drop in productivity, so management plans to make it permanent.",
    q: "最も適切な要約は？",
    choices: [
      "週3のリモート勤務制度は好評で生産性も落ちず、恒久化される見込み。",
      "リモート勤務は生産性を下げたため廃止される。",
      "全社員が完全リモートに移行することが決まった。",
      "制度は試験的で、満足度のデータはまだ無い。"
    ],
    explain: "満足度↑・生産性維持→恒久化、が中心。『3日』『恒久化予定』を正確に。" },
  { type: "summary", level: "C1",
    text: "While the merger promises economies of scale, integrating two very different corporate cultures poses a significant risk that could erode the expected synergies.",
    q: "最も適切な要約は？",
    choices: [
      "合併は規模の利益をもたらすが、異なる企業文化の統合が相乗効果を損なう恐れがある。",
      "合併により企業文化が自然に統合され、リスクは無い。",
      "合併は規模の縮小をもたらすため見送られた。",
      "相乗効果はすでに完全に実現している。"
    ],
    explain: "While（譲歩）＋ pose a risk ＋ erode synergies。利点と懸念の対比が骨子。" },

  /* ---------------- パラフレーズ Paraphrase ---------------- */
  { type: "paraphrase", level: "B1",
    text: "Could you get back to me by Friday?",
    q: "ほぼ同じ意味になる言い換えは？",
    choices: [
      "Could you reply to me by Friday?",
      "Could you come back here on Friday?",
      "Could you finish the project on Friday?",
      "Could you call me every Friday?"
    ],
    explain: "get back to 人 ＝ 人に返信・折り返す。reply to が同義。" },
  { type: "paraphrase", level: "B2",
    text: "We need to touch base before the meeting.",
    q: "ほぼ同じ意味の言い換えは？",
    choices: [
      "We need to check in with each other before the meeting.",
      "We need to cancel the meeting.",
      "We need to arrive at the base before the meeting.",
      "We need to start the meeting early."
    ],
    explain: "touch base ＝ 軽く連絡を取り合う＝check in with each other。" },
  { type: "paraphrase", level: "B2",
    text: "The deadline is non-negotiable.",
    q: "ほぼ同じ意味の言い換えは？",
    choices: [
      "The deadline cannot be changed.",
      "The deadline is flexible.",
      "We can discuss the deadline later.",
      "There is no deadline."
    ],
    explain: "non-negotiable ＝ 交渉の余地がない＝変更できない。" },
  { type: "paraphrase", level: "C1",
    text: "Let's table this discussion for now.",
    q: "（米）ほぼ同じ意味の言い換えは？",
    choices: [
      "Let's postpone this discussion for now.",
      "Let's finish this discussion right now.",
      "Let's put this on the table to decide now.",
      "Let's vote on this discussion now."
    ],
    explain: "(米)table ＝ 議論を一旦保留にする＝postpone。" },

  /* ---------------- 精読・英文解釈 Intensive / Analysis ---------------- */
  { type: "intensive", level: "B2",
    text: "Had we known about the risk, we would have postponed the launch.",
    q: "この文が表す内容は？",
    choices: [
      "実際にはリスクを知らず、ローンチを延期しなかった。",
      "リスクを知っていたので延期した。",
      "これからリスクを調べて延期するつもりだ。",
      "リスクは無かったので予定通り実施した。"
    ],
    explain: "Had we known＝仮定法過去完了（if省略の倒置）。事実は『知らなかった＋延期しなかった』。" },
  { type: "intensive", level: "B2",
    text: "It was the supplier, not the factory, that caused the delay.",
    q: "下線部の解釈として正しいのは？",
    choices: [
      "遅延の原因は工場ではなく供給業者だった。",
      "遅延の原因は供給業者ではなく工場だった。",
      "供給業者も工場も遅延の原因ではない。",
      "遅延は起きなかった。"
    ],
    explain: "It was X, not Y, that …＝強調構文。原因はX（supplier）であってY（factory）ではない。" },
  { type: "intensive", level: "C1",
    text: "The report, which few had read, nonetheless shaped the final decision.",
    q: "この文の意味は？",
    choices: [
      "ほとんど読まれなかったその報告書が、それでも最終決定を左右した。",
      "多くの人が読んだ報告書が決定を左右した。",
      "報告書は最終決定に影響しなかった。",
      "報告書は読まれた後に廃棄された。"
    ],
    explain: "which few had read＝非制限用法（補足）。nonetheless＝それでもなお。少数しか読まずとも決定を形作った。" },
  { type: "intensive", level: "C1",
    text: "Not until the audit was complete did the discrepancy come to light.",
    q: "この文の意味は？",
    choices: [
      "監査が完了して初めて、その食い違いが明らかになった。",
      "監査の前に食い違いが見つかった。",
      "監査をしても食い違いは見つからなかった。",
      "食い違いは最後まで分からなかった。"
    ],
    explain: "Not until …＋倒置（did … come to light）。『…して初めて〜した』。" },

  /* ---------------- 質問力 Questioning ---------------- */
  { type: "question", level: "B1",
    text: "相手の提案の締め切りがいつか、丁寧に確認したい。",
    q: "最も適切な質問は？",
    choices: [
      "When would you need this by?",
      "Why do you need this?",
      "Do you like this deadline?",
      "Can you do this deadline?"
    ],
    explain: "need this by ＝ いつまでに必要か。丁寧に締め切りを尋ねる定番。" },
  { type: "question", level: "B2",
    text: "相手の発言の意図が分からず、具体例を求めたい。",
    q: "最も適切な質問は？",
    choices: [
      "Could you give me an example of what you mean?",
      "Are you sure about that?",
      "Why are you saying this to me?",
      "Is that all you have?"
    ],
    explain: "give me an example ＝ 具体例を求める。相手を責めず意図を明確化する。" },
  { type: "question", level: "B2",
    text: "会議で全員の合意が取れているか確かめたい。",
    q: "最も適切な質問は？",
    choices: [
      "Are we all on the same page on this?",
      "Is everyone tired now?",
      "Can we finish early today?",
      "Who disagrees with me here?"
    ],
    explain: "on the same page ＝ 認識が一致。合意確認の自然な問い。" },
  { type: "question", level: "C1",
    text: "提案の前提（想定）が妥当かを掘り下げたい。",
    q: "最も適切な質問は？",
    choices: [
      "What assumptions is this proposal based on?",
      "Do you really think this works?",
      "Whose idea was this anyway?",
      "Can we just move on?"
    ],
    explain: "What assumptions … based on ＝ 前提を問う。建設的に深掘りする質問。" },

  /* ---------------- 即答力 Response Speed ---------------- */
  { type: "response", level: "A2",
    text: "A: Thanks for your help!",
    q: "自然な応答は？",
    choices: [
      "No problem, happy to help.",
      "Yes, I am help.",
      "Thank you for thanks.",
      "You are welcome to help me."
    ],
    explain: "お礼への即答は No problem / My pleasure / Happy to help が自然。" },
  { type: "response", level: "B1",
    text: "A: Sorry, I'm running a bit late.",
    q: "自然な応答は？",
    choices: [
      "No worries, take your time.",
      "You are very late always.",
      "Why you are late again?",
      "I am not waiting you."
    ],
    explain: "遅刻の連絡には No worries, take your time. が定番の気遣い表現。" },
  { type: "response", level: "B2",
    text: "A: Could we push the meeting to 3 p.m.?",
    q: "快諾する自然な応答は？",
    choices: [
      "Sure, 3 works for me.",
      "No, three is a number.",
      "I push the meeting now.",
      "Meeting is push to me yes."
    ],
    explain: "日程変更の依頼には Sure, that works for me. が即答として自然。" },
  { type: "response", level: "B2",
    text: "A: I'm afraid that won't work for us.",
    q: "交渉を続ける自然な応答は？",
    choices: [
      "I understand. What would work better for you?",
      "Then we are finished here.",
      "Why you don't like it?",
      "That is your problem, not mine."
    ],
    explain: "断りを受けたら理解を示しつつ代案を引き出す質問返しが有効。" },

  /* ---------------- 多読 Extensive Reading ---------------- */
  { type: "extensive", level: "B1",
    text: "Maria joined the company three years ago as an intern. She worked hard, learned quickly, and was promoted to team lead last spring. Now she mentors new interns herself.",
    q: "内容に合うものは？",
    choices: [
      "マリアはインターンから昇進し、今は新人を指導している。",
      "マリアは入社したばかりのインターンである。",
      "マリアは昨春に退職した。",
      "マリアは一度も昇進していない。"
    ],
    explain: "intern→昇進(team lead)→今は新人を指導、という時系列。" },
  { type: "extensive", level: "B2",
    text: "The cafe near our office changed its hours. It used to open at seven, but now it opens at eight and closes an hour later, at nine in the evening.",
    q: "内容に合うものは？",
    choices: [
      "カフェは開店が1時間遅くなり、閉店も遅くなった。",
      "カフェは7時開店のまま変わっていない。",
      "カフェは閉店時間だけ早くなった。",
      "カフェは閉店した。"
    ],
    explain: "開店7→8時、閉店も1時間遅く9時。開店・閉店ともに後ろ倒し。" },
  { type: "extensive", level: "B2",
    text: "Our flight was delayed by two hours because of heavy snow. Luckily, we still made our connection in Chicago, though we had to run through the terminal.",
    q: "内容に合うものは？",
    choices: [
      "雪で2時間遅れたが、走って乗り継ぎに間に合った。",
      "雪で欠航になり、乗り継げなかった。",
      "遅延は無く、定刻に到着した。",
      "シカゴで一泊することになった。"
    ],
    explain: "delayed two hours＋still made our connection（走って間に合った）。" }
];

/* ============================================================
   増量セットA：要約・パラフレーズ・精読・質問・即答・多読
   ============================================================ */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  /* ---- 要約 ---- */
  { type:"summary", level:"B1", text:"Our store will close early on Friday for staff training. Normal hours will resume on Saturday morning.", q:"最も適切な要約は？",
    choices:["金曜は研修で早く閉まり、土曜から通常営業に戻る。","金曜は終日休業する。","土曜から永久に閉店する。","研修は土曜の朝に行われる。"], explain:"金曜だけ早閉め＋土曜から通常、が骨子。" },
  { type:"summary", level:"B1", text:"The app update fixed the login bug, but some users now report slower loading. The team is investigating.", q:"最も適切な要約は？",
    choices:["更新でログイン不具合は直ったが、動作が遅いとの報告があり調査中。","更新で全ての問題が解決した。","更新は配信されなかった。","ログイン不具合は未解決のままだ。"], explain:"直った点と新たな遅延、調査中、を押さえる。" },
  { type:"summary", level:"B2", text:"Despite a strong launch, the product struggled once competitors cut their prices. Management is now weighing whether to compete on price or focus on premium features.", q:"最も適切な要約は？",
    choices:["好調な発売後、競合の値下げで苦戦し、価格競争か高級路線かを検討中。","発売は失敗し、すぐ撤退した。","競合が撤退したため独占状態になった。","価格は一切問題になっていない。"], explain:"好調→競合値下げで苦戦→戦略を検討、の流れ。" },
  { type:"summary", level:"B2", text:"The survey shows employees value flexibility over higher pay. In response, HR is expanding remote options rather than adjusting salaries.", q:"最も適切な要約は？",
    choices:["社員は昇給より柔軟性を重視しており、人事はリモートを拡大する。","社員は昇給を最優先している。","人事は給与を大幅に上げる。","調査は実施されなかった。"], explain:"柔軟性＞昇給→リモート拡大、が中心。" },
  { type:"summary", level:"B2", text:"While the prototype impressed investors, the team admits that scaling production will require partners they do not yet have.", q:"最も適切な要約は？",
    choices:["試作品は投資家に好評だが、量産には未確保の提携先が要る。","量産体制はすでに整っている。","投資家は試作品に失望した。","提携先はすでにすべて確保済みだ。"], explain:"好評＋量産には提携先が必要、の対比。" },
  { type:"summary", level:"C1", text:"The report concedes that short-term costs will rise, yet argues that the long-term savings from automation justify the initial investment.", q:"最も適切な要約は？",
    choices:["短期的な費用増は認めつつ、自動化の長期的節約が初期投資に見合うと主張。","自動化は費用がかかるだけで利点が無いとしている。","短期的にも長期的にも費用は変わらないとしている。","初期投資は不要だと述べている。"], explain:"concede（短期増は認める）＋argue（長期節約で正当化）。" },
  { type:"summary", level:"C1", text:"Although the merger cleared regulatory hurdles, analysts caution that overlapping product lines may lead to internal competition rather than the promised efficiency.", q:"最も適切な要約は？",
    choices:["合併は規制を通過したが、製品の重複が効率化どころか社内競合を招くと警告される。","合併は規制で却下された。","製品ラインの重複は一切ない。","効率化はすでに完全に実現した。"], explain:"規制通過＋重複→社内競合の懸念、の対比。" },

  /* ---- パラフレーズ ---- */
  { type:"paraphrase", level:"B1", text:"Let's wrap up the meeting.", q:"ほぼ同じ意味は？",
    choices:["Let's finish the meeting.","Let's start the meeting.","Let's record the meeting.","Let's cancel the meeting."], explain:"wrap up ＝ 締めくくる＝finish。" },
  { type:"paraphrase", level:"B1", text:"I'm snowed under with work.", q:"ほぼ同じ意味は？",
    choices:["I'm extremely busy with work.","I'm taking a break from work.","I'm cold at work.","I have no work to do."], explain:"snowed under ＝ 仕事に忙殺されている。" },
  { type:"paraphrase", level:"B2", text:"Let's iron out the details later.", q:"ほぼ同じ意味は？",
    choices:["Let's sort out the details later.","Let's ignore the details.","Let's print the details.","Let's forget the details."], explain:"iron out ＝ 問題を解消する＝sort out。" },
  { type:"paraphrase", level:"B2", text:"That proposal is a long shot.", q:"ほぼ同じ意味は？",
    choices:["That proposal is unlikely to succeed.","That proposal is certain to succeed.","That proposal is very cheap.","That proposal is very long."], explain:"a long shot ＝ 成功の見込みが薄い。" },
  { type:"paraphrase", level:"B2", text:"We're on the same wavelength.", q:"ほぼ同じ意味は？",
    choices:["We understand each other well.","We disagree completely.","We are in different rooms.","We use the same radio."], explain:"on the same wavelength ＝ 考えが通じ合っている。" },
  { type:"paraphrase", level:"C1", text:"Let's not jump the gun on this.", q:"ほぼ同じ意味は？",
    choices:["Let's not act too soon on this.","Let's not delay this at all.","Let's not use weapons.","Let's not discuss this."], explain:"jump the gun ＝ 早まって行動する。" },
  { type:"paraphrase", level:"C1", text:"The numbers don't add up.", q:"ほぼ同じ意味は？",
    choices:["The numbers don't make sense.","The numbers are too large.","The numbers were not counted.","The numbers are perfect."], explain:"don't add up ＝ つじつまが合わない。" },

  /* ---- 精読・英文解釈 ---- */
  { type:"intensive", level:"B2", text:"Only after the client approved did we begin development.", q:"この文の意味は？",
    choices:["顧客が承認して初めて開発を始めた。","開発を始めてから顧客が承認した。","顧客は承認しなかった。","開発は承認前に終わった。"], explain:"Only after …＋倒置(did we begin)。『…して初めて〜した』。" },
  { type:"intensive", level:"B2", text:"Were it not for your help, we would have missed the deadline.", q:"この文の意味は？",
    choices:["あなたの助けが無ければ締切に間に合わなかっただろう（実際は間に合った）。","あなたの助けで締切に遅れた。","締切はもともと無かった。","あなたは手伝わなかった。"], explain:"Were it not for ＝ If it were not for（〜が無ければ）の倒置。仮定法。" },
  { type:"intensive", level:"B2", text:"The manager, along with two engineers, was responsible for the fix.", q:"動詞が was である理由は？",
    choices:["主語は the manager（単数）で、along with … は挿入だから。","主語が three people（複数）だから。","along with が主語だから。","engineers が主語だから。"], explain:"along with …は主語の数に影響しない。主語は単数 the manager。" },
  { type:"intensive", level:"C1", text:"What matters is not how fast we grow, but how sustainably.", q:"この文の意味は？",
    choices:["重要なのは成長の速さではなく、その持続可能性だ。","重要なのは成長の速さだけだ。","成長は重要ではない。","持続可能性は問題ではない。"], explain:"What matters is not A but B＝重要なのはAではなくB。how sustainably＝どれだけ持続的に。" },
  { type:"intensive", level:"C1", text:"Such was the demand that the site crashed within minutes.", q:"この文の意味は？",
    choices:["需要があまりに大きく、サイトは数分で落ちた。","需要が少なくサイトは安定していた。","サイトは数分で復旧した。","需要とサイトは無関係だった。"], explain:"Such was X that …＝倒置。『非常にXだったので〜』。" },
  { type:"intensive", level:"C1", text:"The proposal, however well intentioned, overlooks the cost.", q:"however well intentioned の意味は？",
    choices:["どれほど善意であっても","決して善意ではないので","善意であるおかげで","善意かどうか不明だが"], explain:"however＋形容詞＝『どれほど〜でも』の譲歩。挿入句。" },

  /* ---- 質問力 ---- */
  { type:"question", level:"B1", text:"相手の発言が聞き取れず、もう一度頼みたい。", q:"最も丁寧な質問は？",
    choices:["Sorry, could you say that again?","What? Repeat.","I don't hear you.","Say again now."], explain:"Could you say that again? が丁寧な聞き返し。" },
  { type:"question", level:"B2", text:"提案の優先順位を確認したい。", q:"最も適切な質問は？",
    choices:["Which of these should we tackle first?","Why do we have so many tasks?","Can we do nothing?","Is this all useless?"], explain:"tackle first＝最初に取り組むべきか、で優先順位を問う。" },
  { type:"question", level:"B2", text:"相手の見積もりの根拠を知りたい。", q:"最も適切な質問は？",
    choices:["What's that estimate based on?","Are you guessing again?","Why so expensive always?","Is that a real number?"], explain:"based on＝何に基づくか、で根拠を尋ねる中立的表現。" },
  { type:"question", level:"B2", text:"会議の落としどころを探りたい。", q:"最も適切な質問は？",
    choices:["What would a good outcome look like for everyone?","When can we just finish?","Who is right here?","Why bother meeting?"], explain:"good outcome look like＝望ましい結果像を共有して合意形成。" },
  { type:"question", level:"C1", text:"相手のリスク認識を引き出したい。", q:"最も適切な質問は？",
    choices:["What's the biggest risk you see here?","Isn't this obviously fine?","Do you ever worry?","Why are you so negative?"], explain:"biggest risk you see＝相手視点のリスクを開かれた形で問う。" },
  { type:"question", level:"C1", text:"決定を保留にすべきか確かめたい。", q:"最も適切な質問は？",
    choices:["Do we have enough information to decide today?","Can we just guess?","Why decide at all?","Is deciding even our job?"], explain:"enough information to decide＝判断材料の十分さを問い、保留の是非を探る。" },

  /* ---- 即答力 ---- */
  { type:"response", level:"A2", text:"A: Nice to meet you.", q:"自然な応答は？",
    choices:["Nice to meet you too.","Yes I meet you.","Thank you for meet.","Me too nice."], explain:"初対面の定番返し Nice to meet you too." },
  { type:"response", level:"B1", text:"A: Can you send me the file by noon?", q:"快諾する自然な応答は？",
    choices:["Sure, I'll send it right away.","Yes, file is noon.","No problem the file send.","I send you noon file."], explain:"依頼への即答は Sure, I'll … right away. が自然。" },
  { type:"response", level:"B1", text:"A: Sorry to keep you waiting.", q:"自然な応答は？",
    choices:["That's okay, no rush.","You wait me too.","Why you keep me?","Waiting is bad yes."], explain:"待たせた詫びには That's okay, no rush. と気遣う。" },
  { type:"response", level:"B2", text:"A: I think we should delay the launch.", q:"理由を尋ねつつ受ける自然な応答は？",
    choices:["That makes sense. What's driving that?","No, launch is launch.","Why you always delay?","Delay is your problem."], explain:"一旦受け(That makes sense)＋理由を問う(What's driving that?)。" },
  { type:"response", level:"B2", text:"A: Could you take the lead on this project?", q:"前向きに引き受ける自然な応答は？",
    choices:["I'd be happy to. Let me map out the steps.","Yes, lead is me okay.","Why me again always?","Project lead is hard no."], explain:"快諾(I'd be happy to)＋次の一手を示すと信頼される。" },
  { type:"response", level:"C1", text:"A: Honestly, I'm not convinced this will work.", q:"対話を深める自然な応答は？",
    choices:["Fair enough. What would convince you?","Then don't do it.","You never agree anyway.","That's not my concern."], explain:"相手の懸念を受け止め(Fair enough)、納得条件を引き出す。" },

  /* ---- 多読 ---- */
  { type:"extensive", level:"B1", text:"Tom started a small blog about cooking. At first, only his friends read it. But after one recipe went viral, thousands of people visited his site in a single week.", q:"内容に合うものは？",
    choices:["あるレシピが話題になり、訪問者が急増した。","ブログは誰にも読まれず閉鎖した。","トムは料理が嫌いだ。","訪問者は最初から数千人いた。"], explain:"最初は友人だけ→バズって急増、の流れ。" },
  { type:"extensive", level:"B2", text:"The factory switched to solar power last year. Although the initial cost was high, the company has already cut its monthly electricity bill by about forty percent.", q:"内容に合うものは？",
    choices:["初期費用は高かったが、電気代を約4割削減できた。","太陽光発電はうまくいかなかった。","電気代は変わらなかった。","工場は閉鎖された。"], explain:"初期費用高い＋月の電気代を約40%削減。" },
  { type:"extensive", level:"B2", text:"Lisa was nervous before her first presentation. She practiced every night for a week. On the day, she still felt anxious, but her preparation paid off and the audience loved it.", q:"内容に合うものは？",
    choices:["準備のおかげで初プレゼンは好評だった。","リサは準備をしなかった。","プレゼンは中止になった。","観客は退屈していた。"], explain:"緊張→毎晩練習→当日も不安だが準備が実を結び好評。" },
  { type:"extensive", level:"C1", text:"The startup pivoted twice before finding its market. Investors who had doubted the founders early on now point to the company as proof that persistence matters more than a perfect first idea.", q:"内容に合うものは？",
    choices:["二度の方針転換の末に市場を見つけ、粘り強さの好例とされている。","最初のアイデアのまま成功した。","投資家は今も懐疑的だ。","会社は倒産した。"], explain:"2度pivot→市場発見→粘り強さの証left。" }
]);

/* ============================================================
   増量セットC：高次スキル第2弾
   ============================================================ */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  /* 要約 */
  { type:"summary", level:"B1", text:"The library will be closed next week for renovation. Books can still be returned using the outdoor drop box.", q:"最も適切な要約は？",
    choices:["来週は改装で休館だが、返却は屋外ボックスで可能。","図書館は永久に閉館する。","本は返却できない。","改装は来月行われる。"], explain:"改装休館＋返却は屋外ボックス、が骨子。" },
  { type:"summary", level:"B2", text:"Customer complaints dropped after we simplified the checkout process, suggesting that the old form was the main source of frustration.", q:"最も適切な要約は？",
    choices:["決済を簡素化したら苦情が減り、旧フォームが不満の主因だったと示唆される。","苦情は増え続けている。","決済処理は変更していない。","顧客は満足したことがない。"], explain:"簡素化→苦情減→旧フォームが主因、の推論。" },
  { type:"summary", level:"B2", text:"The pilot program succeeded in two cities but failed in a third, where weaker infrastructure made delivery unreliable.", q:"最も適切な要約は？",
    choices:["試験は2都市で成功したが、インフラの弱い3都市目では配送が不安定で失敗した。","試験は全都市で成功した。","試験はどこでも失敗した。","インフラは問題にならなかった。"], explain:"2都市成功＋3都市目はインフラ弱く失敗。" },
  { type:"summary", level:"C1", text:"The committee acknowledged the plan's ambition but questioned whether the timeline was realistic given current staffing levels.", q:"最も適切な要約は？",
    choices:["委員会は計画の野心を認めつつ、現在の人員で日程が現実的か疑問視した。","委員会は計画を全面的に承認した。","計画には野心が無いとされた。","人員は十分だと結論された。"], explain:"野心は認める＋人員面で日程に疑問、の対比。" },
  /* パラフレーズ */
  { type:"paraphrase", level:"B1", text:"Let's call it a day.", q:"ほぼ同じ意味は？",
    choices:["Let's stop working for today.","Let's name the day.","Let's start the day.","Let's work all day."], explain:"call it a day ＝ 今日はここまでにする。" },
  { type:"paraphrase", level:"B2", text:"We need to think outside the box.", q:"ほぼ同じ意味は？",
    choices:["We need to think creatively.","We need to think inside a box.","We need to stop thinking.","We need to follow the rules exactly."], explain:"think outside the box ＝ 既成概念にとらわれず考える。" },
  { type:"paraphrase", level:"B2", text:"That's the bottom line.", q:"ほぼ同じ意味は？",
    choices:["That's the most important point.","That's the lowest line.","That's the first step.","That's a small detail."], explain:"the bottom line ＝ 結論・肝心な点。" },
  { type:"paraphrase", level:"C1", text:"Let's touch on that briefly.", q:"ほぼ同じ意味は？",
    choices:["Let's mention that briefly.","Let's avoid that topic.","Let's physically touch it.","Let's argue about that long."], explain:"touch on ＝ （話題に）軽く触れる。" },
  /* 精読 */
  { type:"intensive", level:"B2", text:"No sooner had we launched than the server went down.", q:"この文の意味は？",
    choices:["ローンチした途端にサーバーが落ちた。","ローンチ前にサーバーが落ちた。","サーバーは落ちなかった。","ローンチは中止された。"], explain:"No sooner … than ＝ 〜するや否や。倒置(had we launched)。" },
  { type:"intensive", level:"B2", text:"It is the process, rather than the result, that we should examine.", q:"この文の意味は？",
    choices:["私たちが検討すべきは結果ではなく過程だ。","検討すべきは結果だけだ。","過程は重要でない。","結果も過程も無関係だ。"], explain:"It is A, rather than B, that …＝強調構文。AこそをBではなく。" },
  { type:"intensive", level:"C1", text:"Little did they realize how much the decision would cost them.", q:"この文の意味は？",
    choices:["その決定が高くつくとは彼らはほとんど気づいていなかった。","彼らは損失を正確に把握していた。","決定に費用はかからなかった。","彼らは決定しなかった。"], explain:"Little did they realize ＝ 否定の副詞文頭で倒置。『ほとんど気づかなかった』。" },
  { type:"intensive", level:"C1", text:"Granted that the data is limited, the trend is still hard to ignore.", q:"Granted that … の意味は？",
    choices:["データが限られているのは認めるが","データが豊富なので","データが限られていないので","データを認めないなら"], explain:"Granted that …＝『〜は認めるが』の譲歩。" },
  /* 質問力 */
  { type:"question", level:"B1", text:"締め切りに間に合うか不安で、確認したい。", q:"最も適切な質問は？",
    choices:["Are we still on track for the deadline?","Why is everything late?","Can we forget the deadline?","Is the deadline real?"], explain:"on track for ＝ 予定通り進んでいるか、で進捗確認。" },
  { type:"question", level:"B2", text:"相手の提案の長所短所を引き出したい。", q:"最も適切な質問は？",
    choices:["What are the pros and cons as you see them?","Is this good or bad?","Why propose this?","Do you even know?"], explain:"pros and cons as you see them ＝ 相手視点の利点欠点を開かれた形で。" },
  { type:"question", level:"B2", text:"決定の影響範囲を確かめたい。", q:"最も適切な質問は？",
    choices:["Who else does this decision affect?","Is this my problem?","Why decide now?","Does it matter?"], explain:"Who else … affect ＝ 影響を受ける関係者を確認。" },
  { type:"question", level:"C1", text:"前提を疑い、別の見方を促したい。", q:"最も適切な質問は？",
    choices:["What if we're wrong about that assumption?","Are you sure you're right?","Why think at all?","Isn't it obvious?"], explain:"What if we're wrong …＝前提を仮に疑う建設的な問い。" },
  /* 即答力 */
  { type:"response", level:"B1", text:"A: Would you mind opening the window?", q:"快諾する自然な応答は？",
    choices:["Not at all.","Yes, I mind it.","Window is open mind.","I don't open mind no."], explain:"Would you mind …? に快諾は Not at all.（mindしない＝OK）。" },
  { type:"response", level:"B1", text:"A: Let me know if you need anything.", q:"自然な応答は？",
    choices:["Thanks, I will.","Yes you let me know.","I need nothing you.","Anything is fine know."], explain:"申し出には Thanks, I will. と軽く受ける。" },
  { type:"response", level:"B2", text:"A: I'm afraid the budget is fixed.", q:"交渉を続ける自然な応答は？",
    choices:["I understand. Is there any flexibility on scope instead?","Then forget it.","Budget is always fixed why.","That's unfair to me."], explain:"金額が無理なら範囲(scope)で調整余地を探る。" },
  { type:"response", level:"C1", text:"A: To be honest, this isn't quite what we expected.", q:"前向きに受ける自然な応答は？",
    choices:["I appreciate the honesty. Let's see how we can close the gap.","Then you do it.","Why expect so much?","That's not my fault."], explain:"率直さに感謝＋ギャップを埋める提案で前進。" },
  /* 多読 */
  { type:"extensive", level:"B1", text:"Sam forgot his umbrella, so he got soaked on the way to work. A kind colleague lent him a spare jacket, and by lunchtime his clothes had dried.", q:"内容に合うものは？",
    choices:["傘を忘れて濡れたが、同僚に上着を借りて昼には乾いた。","サムは傘を持っていた。","同僚は冷たかった。","服は一日中濡れていた。"], explain:"傘忘れ→濡れる→同僚が上着→昼に乾く。" },
  { type:"extensive", level:"B2", text:"The new café tried to attract students by offering free Wi-Fi and cheap coffee. It worked: within a month, it became the most popular study spot near campus.", q:"内容に合うものは？",
    choices:["無料Wi-Fiと安いコーヒーで学生を集め、人気の勉強場所になった。","カフェはすぐ閉店した。","学生は来なかった。","コーヒーは高かった。"], explain:"無料Wi-Fi＋安いコーヒー→1か月で人気の勉強スポット。" },
  { type:"extensive", level:"C1", text:"Critics initially dismissed the film as too slow, but word of mouth gradually built an audience, and it went on to become a quiet box-office success.", q:"内容に合うものは？",
    choices:["当初は酷評されたが口コミで観客が増え、地味ながら興行的に成功した。","映画はすぐ大ヒットした。","観客は最後まで増えなかった。","批評家は最初から絶賛した。"], explain:"酷評→口コミで観客増→静かな興行成功。" }
]);

/* ============================================================
   増量セットE：高次スキル第3弾
   ============================================================ */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  /* 要約 */
  { type:"summary", level:"B1", text:"We tested two website designs. Design A got more clicks, but Design B kept visitors on the page longer. We will combine the best parts of both.", q:"最も適切な要約は？",
    choices:["2案をテストし、双方の長所を組み合わせることにした。","Aを完全に採用した。","どちらも失敗だった。","テストは行われなかった。"], explain:"A=クリック多、B=滞在長→両者の長所を統合。" },
  { type:"summary", level:"B2", text:"After three quarters of losses, the division finally broke even, mainly thanks to cost cuts rather than higher sales.", q:"最も適切な要約は？",
    choices:["3四半期の赤字後、主に経費削減で収支トントンになった。","売上増で黒字化した。","赤字が続いている。","経費は増えた。"], explain:"break even＝収支均衡。要因は売上増でなく経費削減。" },
  { type:"summary", level:"B2", text:"The training improved technical skills, but managers noted little change in how teams actually communicate day to day.", q:"最も適切な要約は？",
    choices:["研修で技術力は上がったが、日々の意思疎通はあまり変わらなかった。","研修で全てが改善した。","研修は技術力に効果が無かった。","意思疎通だけが改善した。"], explain:"技術↑だが日常のコミュニケーションは変化少。" },
  { type:"summary", level:"C1", text:"The study found a correlation between the two factors but stopped short of claiming that one causes the other.", q:"最も適切な要約は？",
    choices:["2要因に相関は見られたが、因果関係までは主張していない。","一方が他方の原因だと証明した。","2要因は無関係だった。","研究は中止された。"], explain:"correlation（相関）はあるがcausation（因果）は主張せず。" },
  /* パラフレーズ */
  { type:"paraphrase", level:"B1", text:"Let's keep in touch.", q:"ほぼ同じ意味は？",
    choices:["Let's stay in contact.","Let's touch each other.","Let's stop talking.","Let's meet once only."], explain:"keep in touch ＝ 連絡を取り合う＝stay in contact。" },
  { type:"paraphrase", level:"B2", text:"That's a game changer.", q:"ほぼ同じ意味は？",
    choices:["That changes everything significantly.","That ends the game.","That is a small change.","That is just a game."], explain:"game changer ＝ 形勢を一変させるもの。" },
  { type:"paraphrase", level:"B2", text:"Let's play it by ear.", q:"ほぼ同じ意味は？",
    choices:["Let's decide as we go.","Let's plan every detail now.","Let's listen to music.","Let's cancel it."], explain:"play it by ear ＝ 出たとこ勝負・臨機応変に。" },
  { type:"paraphrase", level:"C1", text:"We need to get the ball rolling.", q:"ほぼ同じ意味は？",
    choices:["We need to get things started.","We need to stop the project.","We need to play with a ball.","We need to slow down."], explain:"get the ball rolling ＝ 物事を始動させる。" },
  /* 精読 */
  { type:"intensive", level:"B2", text:"Hardly had the meeting begun when the power went out.", q:"この文の意味は？",
    choices:["会議が始まるやいなや停電した。","会議は停電後に始まった。","停電は起きなかった。","会議は始まらなかった。"], explain:"Hardly … when ＝ 〜するや否や。倒置(had the meeting begun)。" },
  { type:"intensive", level:"B2", text:"Not only did costs fall, but quality also improved.", q:"この文の意味は？",
    choices:["費用が下がっただけでなく品質も向上した。","費用も品質も悪化した。","費用だけが下がった。","品質だけが向上した。"], explain:"Not only … but also ＝ 〜だけでなく…も。文頭倒置。" },
  { type:"intensive", level:"C1", text:"However compelling the argument, it lacks supporting data.", q:"この文の意味は？",
    choices:["その主張がどれほど説得力があっても、裏づけデータが無い。","主張に説得力は全く無い。","データは十分にある。","主張は受け入れられた。"], explain:"However＋形容詞＝『どれほど〜でも』。" },
  { type:"intensive", level:"C1", text:"It was not until the deadline passed that they realized the error.", q:"この文の意味は？",
    choices:["締切が過ぎて初めて、彼らは誤りに気づいた。","締切前に誤りに気づいた。","誤りは無かった。","締切は過ぎていない。"], explain:"It was not until … that …＝『…して初めて〜した』の強調。" },
  /* 質問力 */
  { type:"question", level:"B1", text:"次に何をすべきか指示を仰ぎたい。", q:"最も適切な質問は？",
    choices:["What should I do next?","Why me always?","Is there nothing?","Can I go home?"], explain:"What should I do next? が明確で丁寧。" },
  { type:"question", level:"B2", text:"相手の本当の懸念を引き出したい。", q:"最も適切な質問は？",
    choices:["What's really holding you back?","Why are you difficult?","Is something wrong with you?","Can't you just agree?"], explain:"holding you back ＝ 妨げている本当の理由を開かれた形で。" },
  { type:"question", level:"B2", text:"締め切りの現実性を確認したい。", q:"最も適切な質問は？",
    choices:["Is this timeline realistic for everyone?","Why so fast always?","Can we ignore it?","Does time matter?"], explain:"realistic for everyone ＝ 全員にとって現実的かを問う。" },
  { type:"question", level:"C1", text:"成功の判断基準を共有したい。", q:"最も適切な質問は？",
    choices:["How will we know if this is successful?","Is this good enough maybe?","Who decides success?","Why measure anything?"], explain:"How will we know …＝成功の指標を事前に合意する問い。" },
  /* 即答力 */
  { type:"response", level:"B1", text:"A: Do you have a second?", q:"自然な応答は？",
    choices:["Sure, what's up?","Yes, I have second.","One second I have yes.","What is a second?"], explain:"Do you have a second? には Sure, what's up? が自然。" },
  { type:"response", level:"B1", text:"A: Great job on the report!", q:"自然な応答は？",
    choices:["Thanks, I appreciate it.","Yes my job is great.","Report is good job yes.","You job great too."], explain:"称賛には Thanks, I appreciate it. と素直に受ける。" },
  { type:"response", level:"B2", text:"A: We might need to cut the budget.", q:"建設的に受ける自然な応答は？",
    choices:["Okay. Where do you think we have the most flexibility?","No cutting allowed.","Why always money problems?","That's impossible to do."], explain:"受容＋どこに余地があるかを一緒に探る。" },
  { type:"response", level:"C1", text:"A: I'd like to push back on that idea.", q:"対話を続ける自然な応答は？",
    choices:["Please do—I'd value your perspective.","You can't push me.","Why do you disagree always?","Then propose better."], explain:"反論を歓迎(Please do)＋相手視点を尊重。" },
  /* 多読 */
  { type:"extensive", level:"B1", text:"Mia wanted to learn guitar. She bought a cheap one and watched free videos online. After six months of daily practice, she played her first song at a friend's party.", q:"内容に合うものは？",
    choices:["独学で半年練習し、友人のパーティーで初めて演奏した。","ミアはギターをすぐやめた。","高価なギターを買った。","レッスンに通った。"], explain:"安いギター＋無料動画＋毎日半年→パーティーで初演奏。" },
  { type:"extensive", level:"B2", text:"The bakery began donating unsold bread to a local shelter each evening. Customers liked the idea so much that sales actually rose, helping both the shelter and the business.", q:"内容に合うものは？",
    choices:["売れ残りの寄付が好評で、売上も伸び双方に利益となった。","寄付で売上が落ちた。","パン屋は閉店した。","客は寄付を嫌った。"], explain:"寄付→客に好評→売上増→双方にプラス。" },
  { type:"extensive", level:"C1", text:"At first the policy seemed purely symbolic, but over several years it quietly reshaped how the entire industry approached safety, setting a new informal standard.", q:"内容に合うものは？",
    choices:["当初は象徴的に見えたが、数年かけて業界の安全観を変え新基準となった。","政策はすぐ廃止された。","業界は何も変わらなかった。","政策は最初から強制力があった。"], explain:"象徴的→数年で業界の安全観を変え非公式基準に。" }
]);

/* ============================================================
   増量セットG：高次スキル第4弾
   ============================================================ */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  /* 要約 */
  { type:"summary", level:"B1", text:"Our team missed the first deadline because the requirements kept changing. Once the client finalized the scope, we delivered within a week.", q:"最も適切な要約は？",
    choices:["要件変更で初回は遅れたが、範囲確定後は1週間で納品した。","チームは一度も納品しなかった。","要件は最初から固定されていた。","クライアントは満足しなかった。"], explain:"要件変動→初回遅延→範囲確定後は迅速納品。" },
  { type:"summary", level:"B2", text:"The campaign reached many people but converted few into buyers, suggesting the message attracts attention without driving action.", q:"最も適切な要約は？",
    choices:["広告は多くに届いたが購入には繋がらず、注目はされるが行動を促せていない。","広告は誰にも届かなかった。","購入が爆発的に増えた。","注目もされなかった。"], explain:"reach多いがconvert少→注目はするが行動を促せず。" },
  { type:"summary", level:"B2", text:"Remote work cut commuting time, but several employees said they now find it harder to switch off from work in the evenings.", q:"最も適切な要約は？",
    choices:["在宅で通勤は減ったが、夜に仕事から切り替えにくいとの声がある。","在宅で全員が満足した。","通勤時間は変わらなかった。","夜は完全に休めている。"], explain:"通勤減のメリット＋オンオフの切替が難しいデメリット。" },
  { type:"summary", level:"C1", text:"The reforms boosted short-term output, yet critics warn that neglecting maintenance now may lead to costly failures later.", q:"最も適切な要約は？",
    choices:["改革で短期的な生産は増えたが、保守軽視が将来高くつくと警告される。","改革は完全に失敗した。","保守は十分に行われている。","将来のリスクは無い。"], explain:"短期増産＋保守軽視→将来の高コスト障害の懸念。" },
  /* パラフレーズ */
  { type:"paraphrase", level:"B1", text:"Let's break the ice.", q:"ほぼ同じ意味は？",
    choices:["Let's ease the initial tension.","Let's break some ice cubes.","Let's end the meeting.","Let's stay silent."], explain:"break the ice ＝ 場の緊張をほぐす。" },
  { type:"paraphrase", level:"B2", text:"We're cutting it close.", q:"ほぼ同じ意味は？",
    choices:["We barely have enough time.","We have plenty of time.","We are cutting paper.","We are very early."], explain:"cut it close ＝ 時間ぎりぎり。" },
  { type:"paraphrase", level:"B2", text:"That's a tall order.", q:"ほぼ同じ意味は？",
    choices:["That's a difficult request.","That's a high shelf.","That's an easy task.","That's a big meal."], explain:"a tall order ＝ 難しい注文・要求。" },
  { type:"paraphrase", level:"C1", text:"Let's not put the cart before the horse.", q:"ほぼ同じ意味は？",
    choices:["Let's not do things in the wrong order.","Let's not buy a horse.","Let's not hurry the horse.","Let's not skip the meeting."], explain:"put the cart before the horse ＝ 順序を取り違える。" },
  /* 精読 */
  { type:"intensive", level:"B2", text:"So complex was the issue that no one could solve it alone.", q:"この文の意味は？",
    choices:["その問題は非常に複雑で、誰も独力では解決できなかった。","問題は単純だった。","誰もが簡単に解いた。","問題は存在しなかった。"], explain:"So complex was X that …＝倒置の強調。『非常に複雑なので〜』。" },
  { type:"intensive", level:"B2", text:"Whatever the cause, the result remains the same.", q:"この文の意味は？",
    choices:["原因が何であれ、結果は変わらない。","原因が分かれば結果も変わる。","結果に原因は無い。","原因も結果も不明だ。"], explain:"Whatever the cause ＝ 譲歩『原因が何であろうと』。" },
  { type:"intensive", level:"C1", text:"The plan, ambitious as it was, ultimately proved impractical.", q:"ambitious as it was の意味は？",
    choices:["それは野心的ではあったが","野心的でなかったので","野心的だったおかげで","野心的かは不明だが"], explain:"形容詞＋as＋S＋V＝『〜ではあるが』の譲歩倒置。" },
  { type:"intensive", level:"C1", text:"Were the proposal to fail, we would need a backup plan.", q:"この文の意味は？",
    choices:["仮に提案が失敗したら、代替案が必要になるだろう。","提案は必ず失敗する。","代替案はすでにある。","提案は失敗しなかった。"], explain:"Were S to do ＝ If S were to do（万一〜なら）の倒置。" },
  /* 質問力 */
  { type:"question", level:"B1", text:"会議の目的を最初に確認したい。", q:"最も適切な質問は？",
    choices:["What's the goal of today's meeting?","Why are we here?","Can we skip this?","Is this meeting needed?"], explain:"goal of … meeting で目的を明確化して始める。" },
  { type:"question", level:"B2", text:"相手の希望する次の一手を引き出したい。", q:"最も適切な質問は？",
    choices:["What would you like to see happen next?","Why nothing happens?","Is this going anywhere?","Can you do better?"], explain:"like to see happen next で相手の期待する展開を問う。" },
  { type:"question", level:"B2", text:"合意済みの点と未解決の点を切り分けたい。", q:"最も適切な質問は？",
    choices:["What have we agreed on, and what's still open?","Are we done yet?","Why so slow?","Is anything decided?"], explain:"agreed on / still open で論点を整理する。" },
  { type:"question", level:"C1", text:"想定外の事態への備えを確認したい。", q:"最も適切な質問は？",
    choices:["What's our plan B if this doesn't work?","Will it just work?","Why worry at all?","Is failure possible?"], explain:"plan B if … で代替策を建設的に問う。" },
  /* 即答力 */
  { type:"response", level:"B1", text:"A: Can I call you back in five minutes?", q:"自然な応答は？",
    choices:["Sure, take your time.","Yes, five minutes call.","No back call please.","Why five only?"], explain:"折り返しの申し出には Sure, take your time. が自然。" },
  { type:"response", level:"B1", text:"A: I really appreciate your patience.", q:"自然な応答は？",
    choices:["Of course, no problem at all.","Yes my patience is good.","Patience appreciate you too.","I am patient person yes."], explain:"感謝には Of course, no problem. と軽く返す。" },
  { type:"response", level:"B2", text:"A: We're a little over budget on this.", q:"建設的に受ける自然な応答は？",
    choices:["Let's see what we can trim without hurting quality.","Then cancel everything.","Budget is your job not mine.","Why always over budget?"], explain:"品質を損なわず削れる所を一緒に探す姿勢。" },
  { type:"response", level:"C1", text:"A: I'm still on the fence about this.", q:"対話を進める自然な応答は？",
    choices:["What would help you decide either way?","Just decide now.","Why can't you choose?","Stop hesitating please."], explain:"判断を助ける材料を尋ね、迷いを前進に変える。" },
  /* 多読 */
  { type:"extensive", level:"B1", text:"Ken started saving a little money each month. It felt slow at first, but after two years he had enough to take the trip he had always dreamed of.", q:"内容に合うものは？",
    choices:["毎月少しずつ貯金し、2年後に念願の旅行ができた。","ケンは貯金をやめた。","すぐに大金が貯まった。","旅行には行けなかった。"], explain:"毎月少額→2年で念願の旅行資金に。" },
  { type:"extensive", level:"B2", text:"The small town introduced free bus rides on weekends. Local shops worried at first, but foot traffic increased and many stores reported their best summer in years.", q:"内容に合うものは？",
    choices:["週末の無料バスで人出が増え、多くの店が好調だった。","無料バスで客が減った。","店は最初から賛成だった。","バスは廃止された。"], explain:"無料バス→人出増→多くの店が好調。" },
  { type:"extensive", level:"C1", text:"The author spent a decade on the novel, revising it more than twenty times. When it finally appeared, readers praised the very precision that had so delayed its release.", q:"内容に合うものは？",
    choices:["10年・20回超の推敲で遅れたが、その緻密さが読者に称賛された。","小説はすぐ完成した。","読者は緻密さを嫌った。","小説は出版されなかった。"], explain:"長い推敲で遅延→その緻密さが称賛された。" }
]);

/* 増量セットI：高次スキル第5弾 */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B2", text:"Sales of the old model fell sharply after the new version launched, but total revenue still grew because the new model sells at a higher price.", q:"最も適切な要約は？",
    choices:["旧モデルは激減したが、高価格の新モデルで総売上は伸びた。","総売上は減少した。","新モデルは売れなかった。","価格は変わらなかった。"], explain:"旧モデル減＋新モデル高単価→総売上は増。" },
  { type:"summary", level:"C1", text:"While automation reduced errors on the line, it also required workers to learn new skills, shifting rather than eliminating the need for human oversight.", q:"最も適切な要約は？",
    choices:["自動化でミスは減ったが新スキルが必要になり、人の監督は無くならず形を変えた。","自動化で人手は完全に不要になった。","自動化でミスは増えた。","スキルは不要になった。"], explain:"ミス減＋新スキル要＋監督は消えず移行。" },
  { type:"paraphrase", level:"B2", text:"Let's circle back to this later.", q:"ほぼ同じ意味は？",
    choices:["Let's return to this later.","Let's draw a circle.","Let's finish this now.","Let's forget this."], explain:"circle back ＝ 後で戻る・また取り上げる。" },
  { type:"paraphrase", level:"C1", text:"That's beyond the scope of this project.", q:"ほぼ同じ意味は？",
    choices:["That's outside what this project covers.","That's the main goal.","That's very cheap.","That's already finished."], explain:"beyond the scope ＝ 対象範囲外。" },
  { type:"intensive", level:"B2", text:"Rarely do we see such a clear result.", q:"この文の意味は？",
    choices:["これほど明確な結果はめったに見られない。","明確な結果をよく見る。","結果は明確でない。","結果を全く見ない。"], explain:"Rarely 文頭で倒置。『めったに〜ない』。" },
  { type:"intensive", level:"C1", text:"For all its flaws, the system works reliably.", q:"For all its flaws の意味は？",
    choices:["欠点はあるものの","欠点ゆえに","欠点が無いので","欠点が全てなので"], explain:"For all …＝『〜にもかかわらず』の譲歩。" },
  { type:"question", level:"B2", text:"相手の合意を最終確認したい。", q:"最も適切な質問は？",
    choices:["So, are we all comfortable moving forward?","Can we stop now?","Why hesitate?","Is anyone unhappy always?"], explain:"comfortable moving forward で合意を穏やかに最終確認。" },
  { type:"question", level:"C1", text:"トレードオフを明確にしたい。", q:"最も適切な質問は？",
    choices:["What are we trading off if we choose this?","Is this just the best?","Why not have both?","Does cost matter?"], explain:"trading off で犠牲になるものを明確化。" },
  { type:"response", level:"B2", text:"A: I'm not sure we can afford this.", q:"建設的な応答は？",
    choices:["Understood. Could we phase it to spread the cost?","Then just don't buy it.","Money again, really?","That's not my issue."], explain:"段階導入(phase)で費用分散を提案。" },
  { type:"response", level:"C1", text:"A: Let's agree to disagree on this point.", q:"自然な応答は？",
    choices:["Fair enough. Let's focus on where we align.","No, you must agree.","Why won't you give in?","Fine, you always win."], explain:"相違を認めつつ合意点に焦点化。" },
  { type:"extensive", level:"B2", text:"A new coffee shop opened next to the station. The owner remembered regulars' names and orders, and within months it had a loyal crowd despite bigger chains nearby.", q:"内容に合うものは？",
    choices:["常連の名前と注文を覚える接客で、大手チェーンがあっても固定客がついた。","店はすぐ潰れた。","客は誰も来なかった。","大手チェーンに勝てなかった。"], explain:"丁寧な接客→大手があっても固定客獲得。" },
  { type:"extensive", level:"C1", text:"The committee rejected the bold redesign in favor of minor tweaks. Years later, a rival adopted a similar bold approach and captured much of the market the committee had hoped to keep.", q:"内容に合うものは？",
    choices:["大胆案を退け小改良を選んだ結果、後に競合が大胆策で市場を奪った。","委員会は大胆案を採用した。","競合は失敗した。","市場は変化しなかった。"], explain:"保守的選択→後に競合が大胆策で市場奪取。" }
]);

/* 増量セットK：高次スキル第6弾（大バッチ） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The hotel raised its prices during the festival, but rooms still sold out weeks in advance because demand was so high.", q:"最も適切な要約は？", choices:["値上げしても需要が高く、数週間前に完売した。","値上げで客が減った。","部屋は売れ残った。","祭りは中止された。"], explain:"値上げ＋高需要→数週間前に完売。" },
  { type:"summary", level:"B2", text:"The update improved battery life but introduced a bug that occasionally freezes the screen, so the team plans a quick follow-up patch.", q:"最も適切な要約は？", choices:["電池は改善したが画面が固まる不具合が出て、追加修正を予定。","更新で全てが改善した。","電池は悪化した。","不具合は無かった。"], explain:"電池改善＋固まる不具合→追加パッチ予定。" },
  { type:"summary", level:"C1", text:"Although the policy was popular with the public, economists warned that its hidden costs would surface only after several years.", q:"最も適切な要約は？", choices:["政策は好評だが、隠れた費用が数年後に表面化すると警告された。","政策は不評だった。","費用は無いとされた。","費用はすぐ表面化した。"], explain:"好評＋隠れた費用が数年後に顕在化の警告。" },
  { type:"paraphrase", level:"B1", text:"We're running low on time.", q:"ほぼ同じ意味は？", choices:["We don't have much time left.","We have plenty of time.","We are running fast.","Time has stopped."], explain:"running low on ＝ 残りが少ない。" },
  { type:"paraphrase", level:"B2", text:"Let's nail down the details.", q:"ほぼ同じ意味は？", choices:["Let's finalize the details.","Let's hammer a nail.","Let's ignore the details.","Let's start over."], explain:"nail down ＝ 確定させる。" },
  { type:"paraphrase", level:"B2", text:"That ship has sailed.", q:"ほぼ同じ意味は？", choices:["That opportunity is gone.","The ship is arriving.","Let's take a boat.","We are at sea."], explain:"that ship has sailed ＝ もう手遅れ・機会は去った。" },
  { type:"paraphrase", level:"C1", text:"Let's keep our options open.", q:"ほぼ同じ意味は？", choices:["Let's not commit to one choice yet.","Let's open the door.","Let's decide right now.","Let's reject everything."], explain:"keep options open ＝ 選択肢を残しておく。" },
  { type:"intensive", level:"B2", text:"Seldom have we faced such a challenge.", q:"この文の意味は？", choices:["これほどの難題に直面することはめったになかった。","よく難題に直面する。","難題は無かった。","難題を避けた。"], explain:"Seldom 文頭で倒置。『めったに〜ない』。" },
  { type:"intensive", level:"B2", text:"The more we automate, the fewer errors we make.", q:"この文の意味は？", choices:["自動化するほど、ミスは減る。","自動化するほどミスが増える。","自動化とミスは無関係。","自動化しないとミスが減る。"], explain:"The 比較級, the 比較級 ＝ 〜すればするほど…。" },
  { type:"intensive", level:"C1", text:"Such measures, however necessary, come at a cost.", q:"however necessary の意味は？", choices:["どれほど必要であっても","必要でないので","必要なおかげで","必要かは不明だが"], explain:"however＋形容詞＝『どれほど〜でも』。" },
  { type:"question", level:"B1", text:"相手が今手が空いているか確認したい。", q:"最も適切な質問は？", choices:["Is now a good time to talk?","Why are you busy?","Can you never talk?","Is talking hard?"], explain:"Is now a good time? で相手の都合を確認。" },
  { type:"question", level:"B2", text:"提案の実現可能性を確認したい。", q:"最も適切な質問は？", choices:["Is this realistic given our resources?","Why bother trying?","Can we do magic?","Is anything possible?"], explain:"realistic given our resources で実現性を問う。" },
  { type:"question", level:"C1", text:"意思決定者を確認したい。", q:"最も適切な質問は？", choices:["Who has the final say on this?","Why decide at all?","Is anyone in charge?","Does it matter who?"], explain:"final say で決定権者を明確化。" },
  { type:"response", level:"B1", text:"A: Could you give me a hand?", q:"快諾する応答は？", choices:["Of course, what do you need?","Yes, my hand is here.","Hand is busy now.","Why my hand always?"], explain:"手伝いの依頼には Of course, what do you need? が自然。" },
  { type:"response", level:"B2", text:"A: This timeline feels too tight.", q:"建設的な応答は？", choices:["I hear you. Which part worries you most?","Then work faster.","Time is time always.","Not my problem."], explain:"懸念を受け止め、具体化する問い返し。" },
  { type:"response", level:"C1", text:"A: I think we should reconsider the whole approach.", q:"前向きな応答は？", choices:["That's worth exploring. What alternative do you have in mind?","No, the approach is final.","Why change everything?","You always complain."], explain:"再考を歓迎し、代替案を引き出す。" },
  { type:"extensive", level:"B1", text:"Jenny volunteered at the animal shelter every weekend. She started by cleaning cages, but soon she was helping families find the right pet to adopt.", q:"内容に合うものは？", choices:["最初は掃除から始め、やがて里親探しを手伝うようになった。","ジェニーは一度も行かなかった。","彼女は動物が嫌いだ。","掃除しかしなかった。"], explain:"掃除から始め→里親探しの手伝いへ。" },
  { type:"extensive", level:"B2", text:"The company offered a four-day workweek as a trial. Productivity stayed the same, and employee surveys showed a sharp rise in job satisfaction, so the trial became permanent.", q:"内容に合うものは？", choices:["週4日制で生産性は維持され満足度が上がり、恒久化された。","生産性が落ちた。","制度は廃止された。","満足度は変わらなかった。"], explain:"生産性維持＋満足度上昇→恒久化。" },
  { type:"extensive", level:"C1", text:"The documentary went largely unnoticed on release, but a decade later it was rediscovered online and praised as ahead of its time.", q:"内容に合うものは？", choices:["公開時は注目されなかったが、10年後に再発見され先見的と評価された。","公開時から大ヒットした。","二度と見られなかった。","酷評され続けた。"], explain:"公開時は無名→10年後に再発見・高評価。" }
]);

/* 増量セットM：高次スキル第7弾 */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The team tried a new tool for two weeks. It saved time on simple tasks but felt clunky for complex ones, so they decided to use it only for routine work.", q:"最も適切な要約は？", choices:["新ツールは単純作業向きで、定型業務に限って使うことにした。","新ツールを全面導入した。","新ツールは全く使えなかった。","複雑な作業に最適だった。"], explain:"単純作業に有効＋複雑作業は不便→定型業務のみ採用。" },
  { type:"summary", level:"B2", text:"Customer feedback was mixed: long-time users disliked the redesign, while new users found it easier to navigate. The team plans an optional classic view.", q:"最も適切な要約は？", choices:["賛否が分かれ、従来表示を選べるようにする予定。","全員が新デザインを気に入った。","新規ユーザーは混乱した。","デザインは元に戻された。"], explain:"既存ユーザー不満＋新規は好評→従来表示を任意提供。" },
  { type:"summary", level:"C1", text:"The initiative succeeded technically but failed to gain adoption, largely because staff were never given time to learn the new system.", q:"最も適切な要約は？", choices:["技術的には成功したが、学習時間が無く定着しなかった。","技術的に失敗した。","全員がすぐ使いこなした。","学習時間は十分だった。"], explain:"技術的成功＋学習時間不足→定着せず。" },
  { type:"paraphrase", level:"B1", text:"Let's go over it once more.", q:"ほぼ同じ意味は？", choices:["Let's review it again.","Let's go somewhere.","Let's finish it.","Let's skip it."], explain:"go over ＝ 見直す＝review。" },
  { type:"paraphrase", level:"B2", text:"That's up in the air.", q:"ほぼ同じ意味は？", choices:["That's still undecided.","That's flying away.","That's finished.","That's certain."], explain:"up in the air ＝ 未定で。" },
  { type:"paraphrase", level:"B2", text:"Let's hash out the plan.", q:"ほぼ同じ意味は？", choices:["Let's discuss the plan in detail.","Let's cook the plan.","Let's cancel the plan.","Let's hide the plan."], explain:"hash out ＝ 徹底的に話し合う。" },
  { type:"paraphrase", level:"C1", text:"We're in uncharted territory.", q:"ほぼ同じ意味は？", choices:["We're in a situation no one has faced before.","We're on a map.","We're lost in a forest.","We're very safe."], explain:"uncharted territory ＝ 前例のない状況。" },
  { type:"intensive", level:"B2", text:"Not until we reviewed the logs did the pattern emerge.", q:"この文の意味は？", choices:["ログを確認して初めてパターンが見えた。","パターンを見てからログを確認した。","パターンは現れなかった。","ログは確認しなかった。"], explain:"Not until …＋倒置。『…して初めて〜』。" },
  { type:"intensive", level:"B2", text:"The plan looks good on paper, but execution is another matter.", q:"on paper の意味は？", choices:["理屈の上では","紙の上に書いて","新聞によれば","完全に"], explain:"on paper ＝ 理論上は（実際は別、の含み）。" },
  { type:"intensive", level:"C1", text:"Far from solving the problem, the fix made things worse.", q:"Far from solving の意味は？", choices:["問題を解決するどころか","問題を解決した後で","問題から遠ざかって","問題を解決しながら"], explain:"Far from -ing ＝ 〜するどころか。" },
  { type:"question", level:"B1", text:"締切に間に合うか心配で確認したい。", q:"最も適切な質問は？", choices:["Do you think we'll make it in time?","Why is it late?","Can we forget it?","Is time real?"], explain:"make it in time ＝ 間に合うか、を尋ねる。" },
  { type:"question", level:"B2", text:"相手の負担を確認して配慮したい。", q:"最も適切な質問は？", choices:["Is this manageable on your end?","Are you lazy?","Why so slow?","Can't you do more?"], explain:"manageable on your end ＝ そちらで対応可能か、と配慮。" },
  { type:"question", level:"C1", text:"見落としが無いか確認したい。", q:"最も適切な質問は？", choices:["Is there anything we might be overlooking?","Are we done?","Why bother checking?","Is this perfect?"], explain:"might be overlooking ＝ 見落としの可能性を開かれた形で問う。" },
  { type:"response", level:"B1", text:"A: Sorry, I didn't catch your name.", q:"自然な応答は？", choices:["No problem, it's Ken.","Yes my name catch.","Why you not catch?","Name is difficult sorry."], explain:"didn't catch ＝ 聞き取れなかった、には名前を繰り返す。" },
  { type:"response", level:"B2", text:"A: This approach has some risks.", q:"建設的な応答は？", choices:["Agreed. How can we reduce them?","Then drop it.","Risks are everywhere why.","Not my concern."], explain:"同意＋どう減らすかを一緒に考える。" },
  { type:"response", level:"C1", text:"A: I'd rather we revisit this next week.", q:"自然な応答は？", choices:["Sure. Let's pick it up then.","No, decide now.","Why delay always?","Fine, you win again."], explain:"延期の希望を受け、再開を約束する。" },
  { type:"extensive", level:"B1", text:"After moving to a new city, Aki felt lonely at first. She joined a cooking class to meet people, and within a month she had made several close friends.", q:"内容に合うものは？", choices:["料理教室で人と出会い、1か月で親しい友人ができた。","アキは引っ越さなかった。","友人はできなかった。","料理が嫌いだ。"], explain:"孤独→料理教室→1か月で親友。" },
  { type:"extensive", level:"B2", text:"The restaurant kept its menu small but changed it weekly based on what was fresh. Regulars loved the surprise, and the kitchen wasted far less food.", q:"内容に合うものは？", choices:["少数の旬メニューを週替わりにし、常連に好評で廃棄も減った。","メニューは固定だった。","常連は不満だった。","食品廃棄が増えた。"], explain:"小さく旬で週替わり→常連好評＋廃棄減。" },
  { type:"extensive", level:"C1", text:"The volunteer program started small, with just five participants. Word spread through social media, and a year later it operated in a dozen cities nationwide.", q:"内容に合うものは？", choices:["5人で始まりSNSで広まり、1年で全国十数都市に拡大した。","参加者は5人のままだった。","プログラムは中止された。","SNSは使われなかった。"], explain:"5人→SNS拡散→1年で十数都市。" }
]);

/* 増量セットP：高次スキル第8弾 */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The store moved to a bigger location downtown. Sales rose because of the foot traffic, but parking became a common complaint among customers.", q:"最も適切な要約は？", choices:["都心の広い店に移転し売上は伸びたが、駐車場への不満が出た。","移転で売上が落ちた。","駐車場は好評だった。","店は閉店した。"], explain:"移転→人通りで売上増＋駐車場の不満。" },
  { type:"summary", level:"B2", text:"The new hire was technically strong but struggled to communicate with the team. After a mentoring program, collaboration improved noticeably.", q:"最も適切な要約は？", choices:["技術は高いが意思疎通に苦労した新人が、指導で協働が改善した。","新人は技術が低かった。","指導は効果が無かった。","協働は悪化した。"], explain:"技術高＋意思疎通に課題→指導で協働改善。" },
  { type:"summary", level:"C1", text:"Although the merger was framed as a partnership of equals, in practice one company's culture quickly came to dominate the other.", q:"最も適切な要約は？", choices:["対等な提携とされたが、実際は一方の文化が他方を支配した。","両社の文化が融合した。","合併は中止された。","対等な関係が保たれた。"], explain:"建前は対等＋実際は一方が支配。" },
  { type:"paraphrase", level:"B1", text:"Let's wrap this up.", q:"ほぼ同じ意味は？", choices:["Let's finish this.","Let's wrap a gift.","Let's start this.","Let's delay this."], explain:"wrap up ＝ 終える。" },
  { type:"paraphrase", level:"B2", text:"That's a stretch.", q:"ほぼ同じ意味は？", choices:["That's hard to believe.","That's very easy.","That's a long road.","That's certain."], explain:"a stretch ＝ こじつけ・無理がある。" },
  { type:"paraphrase", level:"B2", text:"Let's get our ducks in a row.", q:"ほぼ同じ意味は？", choices:["Let's get organized.","Let's line up ducks.","Let's cancel everything.","Let's relax."], explain:"get ducks in a row ＝ 準備を整える。" },
  { type:"paraphrase", level:"C1", text:"That's the crux of the matter.", q:"ほぼ同じ意味は？", choices:["That's the most important part.","That's a small detail.","That's the end.","That's irrelevant."], explain:"the crux ＝ 核心。" },
  { type:"intensive", level:"B2", text:"Only by working together can we meet the deadline.", q:"この文の意味は？", choices:["協力して初めて締切に間に合う。","協力しても間に合わない。","一人で間に合う。","締切は無い。"], explain:"Only by -ing＋倒置(can we meet)。『〜して初めて』。" },
  { type:"intensive", level:"B2", text:"The report is, if anything, too detailed.", q:"if anything の意味は？", choices:["どちらかと言えば","何かあれば","もし何もなければ","決して"], explain:"if anything ＝ どちらかと言えば。" },
  { type:"intensive", level:"C1", text:"No amount of planning could have prevented this.", q:"この文の意味は？", choices:["どれだけ計画してもこれは防げなかっただろう。","計画すれば防げた。","計画は不要だった。","これは起きなかった。"], explain:"No amount of …＝『どれだけ〜しても…ない』。" },
  { type:"question", level:"B1", text:"相手の都合に合わせたい。", q:"最も適切な質問は？", choices:["What time suits you best?","Why are you busy?","Can you never meet?","Is time hard?"], explain:"suits you best ＝ 最も都合がよいか、を尋ねる。" },
  { type:"question", level:"B2", text:"成功例から学びたい。", q:"最も適切な質問は？", choices:["What's worked well for you before?","Why do you succeed?","Is failure common?","Can you teach magic?"], explain:"worked well before ＝ 過去の成功例を引き出す。" },
  { type:"question", level:"C1", text:"代償を明確にしたい。", q:"最も適切な質問は？", choices:["What are we giving up if we go this route?","Is this free?","Why choose anything?","Does cost exist?"], explain:"giving up ＝ この道を選ぶと何を犠牲にするか。" },
  { type:"response", level:"B1", text:"A: Can you make it on Friday?", q:"自然な応答は？", choices:["Friday works for me.","Yes I make Friday.","Friday is make yes.","I do Friday make."], explain:"日程確認には Friday works for me. が自然。" },
  { type:"response", level:"B2", text:"A: We may need to scale this back.", q:"建設的な応答は？", choices:["Makes sense. What should we keep as the priority?","No scaling back ever.","Why reduce always?","That's a bad idea."], explain:"受容＋優先で残すものを問う。" },
  { type:"response", level:"C1", text:"A: I'm not fully sold on this yet.", q:"自然な応答は？", choices:["That's fair. What would tip the balance for you?","Then just say no.","Why so doubtful?","You never agree."], explain:"納得を後押しする材料を尋ねる。" },
  { type:"extensive", level:"B1", text:"Leo wanted to read more but never found time. He started reading just ten minutes before bed. A year later, he had finished over thirty books.", q:"内容に合うものは？", choices:["寝る前10分の習慣で1年に30冊以上読んだ。","レオは読書をやめた。","時間が無く読めなかった。","30冊は読めなかった。"], explain:"寝る前10分→1年で30冊超。" },
  { type:"extensive", level:"B2", text:"The company let employees pick their own projects one day a week. Some ideas failed, but two became the firm's most profitable products within three years.", q:"内容に合うものは？", choices:["週1の自由プロジェクトから、3年で最も利益を生む製品が2つ生まれた。","自由プロジェクトは全て失敗した。","製品は生まれなかった。","利益は出なかった。"], explain:"週1自由→一部失敗＋2つが最も利益を生む製品に。" },
  { type:"extensive", level:"C1", text:"Initially dismissed as a niche hobby, the technology slowly matured until, two decades on, it underpinned much of everyday digital life.", q:"内容に合うものは？", choices:["当初はニッチな趣味とされたが20年で日常デジタル生活を支えるに至った。","技術はすぐ廃れた。","20年間変化しなかった。","最初から主流だった。"], explain:"ニッチ扱い→20年で日常を支える基盤に。" }
]);

/* 増量セットQ：高次スキル第9弾 */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The library extended its hours during exam season. Students appreciated it, but staff costs rose, so the change will be reviewed after this term.", q:"最も適切な要約は？", choices:["試験期に開館時間を延長し好評だが、費用増のため今学期後に見直す。","開館時間を短縮した。","学生は不満だった。","費用は変わらなかった。"], explain:"延長→好評＋費用増→見直し予定。" },
  { type:"summary", level:"B2", text:"The startup pivoted from selling software to offering it as a subscription. Revenue dipped at first but became far more predictable over the year.", q:"最も適切な要約は？", choices:["売り切りからサブスクに転換し、当初減収も収益が安定した。","サブスクをやめた。","収益は不安定になった。","転換しなかった。"], explain:"サブスク転換→当初減収＋長期で安定。" },
  { type:"summary", level:"C1", text:"While automation reduced manual errors, it also removed the informal knowledge sharing that used to happen when staff did tasks by hand.", q:"最も適切な要約は？", choices:["自動化はミスを減らしたが、手作業時の非公式な知識共有も失われた。","自動化は失敗した。","知識共有が増えた。","ミスが増えた。"], explain:"自動化でミス減＋非公式な知識共有が消失。" },
  { type:"paraphrase", level:"B1", text:"Let's touch base soon.", q:"ほぼ同じ意味は？", choices:["Let's check in with each other soon.","Let's touch the base.","Let's finish soon.","Let's cancel soon."], explain:"touch base ＝ 連絡を取り合う。" },
  { type:"paraphrase", level:"B2", text:"That's a tall order.", q:"ほぼ同じ意味は？", choices:["That's very difficult to do.","That's a big meal.","That's very easy.","That's a short list."], explain:"a tall order ＝ 難題。" },
  { type:"paraphrase", level:"B2", text:"Let's not reinvent the wheel.", q:"ほぼ同じ意味は？", choices:["Let's use what already works.","Let's build a new wheel.","Let's start over.","Let's stop working."], explain:"既存の有効なものを活かす。" },
  { type:"paraphrase", level:"C1", text:"We have skin in the game.", q:"ほぼ同じ意味は？", choices:["We have a real stake in the outcome.","We are playing a game.","We have no interest.","We are injured."], explain:"skin in the game ＝ 当事者として利害がある。" },
  { type:"intensive", level:"B2", text:"Little did we know how much it would cost.", q:"この文の意味は？", choices:["それがどれほど高くつくか、ほとんど分かっていなかった。","費用を正確に知っていた。","費用はかからなかった。","少し知っていた。"], explain:"Little did we know＋倒置で『ほとんど知らなかった』。" },
  { type:"intensive", level:"B2", text:"The plan is, by and large, sound.", q:"by and large の意味は？", choices:["概して","大きさによって","急いで","完全に"], explain:"by and large ＝ 概して。" },
  { type:"intensive", level:"C1", text:"Were it not for your help, we would have failed.", q:"この文の意味は？", choices:["あなたの助けがなければ失敗していただろう。","助けがあったので失敗した。","助けは不要だった。","失敗しなかった理由は不明。"], explain:"Were it not for＝『〜がなければ』の仮定法倒置。" },
  { type:"question", level:"B1", text:"次の一手を一緒に決めたい。", q:"最も適切な質問は？", choices:["What should our next step be?","Why is this hard?","Can we stop now?","Is there a step?"], explain:"next step を一緒に決める問い。" },
  { type:"question", level:"B2", text:"成功の判断基準を確認したい。", q:"最も適切な質問は？", choices:["How will we know if this is successful?","Is success real?","Why try at all?","Can we skip this?"], explain:"成功の定義・指標を尋ねる。" },
  { type:"question", level:"C1", text:"想定外への備えを確認したい。", q:"最も適切な質問は？", choices:["What's our plan if this doesn't go as expected?","Will everything be fine?","Why plan anything?","Is failure possible?"], explain:"コンティンジェンシーを問う。" },
  { type:"response", level:"B1", text:"A: Thanks for jumping on this so quickly.", q:"自然な応答は？", choices:["Of course, happy to help.","Yes I jump fast.","Why thank me now?","Quick is good always."], explain:"迅速対応への礼には Happy to help. が自然。" },
  { type:"response", level:"B2", text:"A: I think we should hold off for now.", q:"建設的な応答は？", choices:["That's fair. What would change your mind?","No, decide today.","Why always wait?","You never commit."], explain:"保留を受け、判断材料を尋ねる。" },
  { type:"response", level:"C1", text:"A: This might be a bit of a stretch, but hear me out.", q:"自然な応答は？", choices:["Sure, go ahead—I'm listening.","No, it's a stretch.","Why bother saying it?","Stretches are bad."], explain:"突飛な提案を受け入れて聞く姿勢を示す。" },
  { type:"extensive", level:"B1", text:"Sam was nervous about public speaking. He joined a small club where members practiced weekly. After six months, he gave a talk to a hundred people without freezing.", q:"内容に合うものは？", choices:["週1の練習を続け、半年後に100人の前で話せた。","サムは話すのをやめた。","練習しなかった。","100人は無理だった。"], explain:"週1練習→半年で100人の前で成功。" },
  { type:"extensive", level:"B2", text:"The cafe started offering its recipes for free online. Some feared losing customers, but visits rose as people came to taste dishes they had tried at home.", q:"内容に合うものは？", choices:["レシピ無料公開で来客が増えた（家で作った料理を店で味わいに来た）。","客が減った。","レシピは非公開だった。","来客は変わらなかった。"], explain:"レシピ無料公開→懸念に反し来客増。" },
  { type:"extensive", level:"C1", text:"Critics dismissed the device as a gimmick. Yet by addressing a problem most rivals ignored, it quietly built a loyal following and outlasted flashier competitors.", q:"内容に合うものは？", choices:["際物扱いされたが、無視されがちな問題を解決し着実に定着した。","すぐ消えた。","競合の方が長続きした。","問題を無視した。"], explain:"際物扱い→他社が無視した問題を解決→定着。" }
]);

/* 増量セットS：高次スキル第10弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The app added a dark mode after many requests. Downloads ticked up, and existing users spent more time in the app at night.", q:"最も適切な要約は？", choices:["要望に応えダークモードを追加し、DLと夜間利用が増えた。","ダークモードを削除した。","利用は減った。","要望は無かった。"], explain:"要望→ダークモード追加→DL・夜間利用増。" },
  { type:"summary", level:"B2", text:"Remote work cut commuting time but blurred the line between work and home, leading the company to set clearer 'offline' hours.", q:"最も適切な要約は？", choices:["在宅は通勤を減らしたが公私の境を曖昧にし、オフライン時間を明確化した。","在宅をやめた。","通勤が増えた。","境界は明確だった。"], explain:"在宅→通勤減＋公私曖昧→オフライン時間明確化。" },
  { type:"summary", level:"C1", text:"The policy aimed to boost short-term sales, and it did, but it trained customers to wait for discounts, eroding full-price demand.", q:"最も適切な要約は？", choices:["短期売上は伸びたが、客が割引待ちになり定価需要が減った。","売上は伸びなかった。","定価需要が増えた。","割引は無かった。"], explain:"短期売上増＋割引待ち習慣→定価需要減。" },
  { type:"summary", level:"B2", text:"The school replaced lectures with group projects. Engagement rose, but quieter students sometimes struggled to contribute equally.", q:"最も適切な要約は？", choices:["講義をグループ課題に変え参加は増えたが、内気な生徒は貢献に苦労した。","課題をやめた。","参加は減った。","全員が均等に貢献した。"], explain:"グループ課題→参加増＋内気な生徒は苦労。" },
  { type:"paraphrase", level:"B1", text:"Let's call it a day.", q:"ほぼ同じ意味は？", choices:["Let's stop working for today.","Let's name the day.","Let's start the day.","Let's work all day."], explain:"call it a day ＝ 今日はここまで。" },
  { type:"paraphrase", level:"B2", text:"It's a slippery slope.", q:"ほぼ同じ意味は？", choices:["One bad step leads to worse ones.","The floor is wet.","It's very easy.","It's a fun ride."], explain:"slippery slope ＝ 悪化の連鎖。" },
  { type:"paraphrase", level:"B2", text:"Let's not cut corners.", q:"ほぼ同じ意味は？", choices:["Let's not do it cheaply or carelessly.","Let's not turn corners.","Let's hurry up.","Let's cut the paper."], explain:"cut corners ＝ 手を抜く。" },
  { type:"paraphrase", level:"C1", text:"That's the crux of it.", q:"ほぼ同じ意味は？", choices:["That's the central point.","That's the end.","That's a minor detail.","That's confusing."], explain:"crux ＝ 核心。" },
  { type:"paraphrase", level:"B2", text:"We're on the same wavelength.", q:"ほぼ同じ意味は？", choices:["We understand each other well.","We use the same radio.","We disagree completely.","We are far apart."], explain:"same wavelength ＝ 考えが通じ合う。" },
  { type:"intensive", level:"B2", text:"Hardly had we started when it began to rain.", q:"この文の意味は？", choices:["始めるやいなや雨が降り出した。","始める前に雨がやんだ。","雨は降らなかった。","ゆっくり始めた。"], explain:"Hardly … when ～＋倒置で『〜するやいなや』。" },
  { type:"intensive", level:"B2", text:"It goes without saying that safety comes first.", q:"It goes without saying の意味は？", choices:["言うまでもなく","黙って行く","言わずに済む","話にならない"], explain:"It goes without saying ＝ 言うまでもなく。" },
  { type:"intensive", level:"C1", text:"Such was the demand that they sold out in minutes.", q:"この文の意味は？", choices:["需要が大きく数分で売り切れた。","需要が無く売れ残った。","ゆっくり売れた。","売らなかった。"], explain:"Such was X that ～：『非常にXだったので〜』の倒置。" },
  { type:"question", level:"B1", text:"相手の意向を尊重して確認したい。", q:"最も適切な質問は？", choices:["How would you like to proceed?","Why do you decide?","Can I ignore you?","Is your way wrong?"], explain:"How would you like to … で意向を丁寧に確認。" },
  { type:"question", level:"B2", text:"懸念点を率直に引き出したい。", q:"最も適切な質問は？", choices:["What worries you most about this plan?","Is anything ever fine?","Why complain always?","Can you stop worrying?"], explain:"What worries you most で懸念を引き出す。" },
  { type:"question", level:"C1", text:"前提の妥当性を一緒に検討したい。", q:"最も適切な質問は？", choices:["What are we assuming that might not hold?","Are assumptions real?","Why question anything?","Is this certain?"], explain:"崩れうる前提を問い、検討を促す。" },
  { type:"response", level:"B1", text:"A: Could you cover for me on Friday?", q:"自然な応答は？", choices:["Sure, I can do that.","Yes I cover you fast.","Why Friday cover?","Cover is difficult maybe."], explain:"代行依頼には Sure, I can do that. が自然。" },
  { type:"response", level:"B2", text:"A: I'm a bit overwhelmed with the workload.", q:"思いやりある応答は？", choices:["Let's see what we can take off your plate.","Then work harder.","Why so weak?","That's your problem."], explain:"負担を一緒に減らす提案で配慮。" },
  { type:"response", level:"C1", text:"A: I'd like to revisit the timeline.", q:"自然な応答は？", choices:["Good idea. What's driving the change?","No, it's fixed.","Why change again?","You always delay."], explain:"見直しを受け、理由を尋ねて前進。" },
  { type:"extensive", level:"B1", text:"Nina disliked running. She started by jogging to the end of her street and back. Bit by bit, she added distance, and a year later she finished her first 5K.", q:"内容に合うものは？", choices:["少しずつ距離を伸ばし、1年で初の5kmを完走した。","ニナは走るのをやめた。","距離は伸びなかった。","5kmは無理だった。"], explain:"少しずつ→1年で初5km完走。" },
  { type:"extensive", level:"B2", text:"The factory switched off machines during idle periods. Output stayed the same, energy bills dropped sharply, and the change paid for itself within months.", q:"内容に合うものは？", choices:["アイドル時に機械を止め、生産維持・電気代減で数か月で元が取れた。","生産が落ちた。","電気代が増えた。","機械を止めなかった。"], explain:"アイドル停止→生産維持＋電気代減→数か月で回収。" },
  { type:"extensive", level:"C1", text:"Long overlooked in favor of flashier rivals, the quiet town reinvented itself as a hub for remote workers, drawing newcomers who valued calm over nightlife.", q:"内容に合うものは？", choices:["見過ごされていた町がリモートワーカーの拠点として再生した。","町は廃れた。","派手な競合が勝った。","誰も来なかった。"], explain:"見過ごされた町→リモート拠点として再生。" }
]);

/* 増量セットU：高次スキル第11弾（6倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The bakery began donating unsold bread each evening. Waste dropped, the community appreciated it, and word of mouth brought in new customers.", q:"最も適切な要約は？", choices:["売れ残りパンの寄付で廃棄が減り、評判で新規客も増えた。","パンを捨て続けた。","客が減った。","寄付をやめた。"], explain:"寄付→廃棄減＋評判で新規客増。" },
  { type:"summary", level:"B2", text:"The firm let staff choose their tools instead of standardizing. Productivity varied, but morale rose and turnover fell noticeably.", q:"最も適切な要約は？", choices:["ツール選択を自由化し、生産性はばらついたが士気が上がり離職が減った。","ツールを統一した。","離職が増えた。","士気が下がった。"], explain:"ツール自由化→生産性ばらつき＋士気向上・離職減。" },
  { type:"summary", level:"C1", text:"By open-sourcing its core, the company lost some licensing income but gained a large contributor base that accelerated its roadmap.", q:"最も適切な要約は？", choices:["中核を公開しライセンス収入は減ったが、貢献者が増え開発が加速した。","収入が増えた。","貢献者が減った。","公開をやめた。"], explain:"OSS化→ライセンス収入減＋貢献者増で開発加速。" },
  { type:"summary", level:"B2", text:"The clinic introduced text reminders for appointments. No-shows fell by a third, freeing up slots and shortening wait times.", q:"最も適切な要約は？", choices:["予約のリマインドで無断欠席が3分の1減り、待ち時間も短縮した。","欠席が増えた。","待ち時間が延びた。","リマインドをやめた。"], explain:"リマインド→無断欠席減→待ち時間短縮。" },
  { type:"paraphrase", level:"B1", text:"Let's keep it brief.", q:"ほぼ同じ意味は？", choices:["Let's keep it short.","Let's keep it secret.","Let's make it long.","Let's keep it quiet."], explain:"keep it brief ＝ 手短に。" },
  { type:"paraphrase", level:"B2", text:"Let's not put the cart before the horse.", q:"ほぼ同じ意味は？", choices:["Let's do things in the right order.","Let's buy a horse.","Let's hurry up.","Let's go backward."], explain:"順序を間違えない。" },
  { type:"paraphrase", level:"B2", text:"We need to move the needle.", q:"ほぼ同じ意味は？", choices:["We need to make a real difference.","We need a needle.","We need to wait.","We need to stop."], explain:"move the needle ＝ 目に見える変化を起こす。" },
  { type:"paraphrase", level:"C1", text:"Let's hedge our bets.", q:"ほぼ同じ意味は？", choices:["Let's spread the risk.","Let's bet everything.","Let's stop betting.","Let's trim the hedge."], explain:"hedge bets ＝ リスク分散。" },
  { type:"paraphrase", level:"B2", text:"That's a fair ask.", q:"ほぼ同じ意味は？", choices:["That's a reasonable request.","That's an unfair price.","That's a hard question.","That's a free gift."], explain:"a fair ask ＝ 妥当な要望。" },
  { type:"intensive", level:"B2", text:"No sooner had he arrived than the phone rang.", q:"この文の意味は？", choices:["彼が着いた途端に電話が鳴った。","着く前に電話が鳴った。","電話は鳴らなかった。","彼は来なかった。"], explain:"No sooner … than ～＋倒置で『〜するや否や』。" },
  { type:"intensive", level:"B2", text:"For all its flaws, the plan is workable.", q:"For all の意味は？", choices:["〜にもかかわらず","〜のために","すべての〜","〜の代わりに"], explain:"For all ＝ 〜にもかかわらず。" },
  { type:"intensive", level:"C1", text:"Granted, the risks are real, but so are the rewards.", q:"Granted の意味は？", choices:["確かに（譲歩）","与えられて","禁止されて","当然ながら否定"], explain:"Granted ＝ 確かに（譲歩を示す談話標識）。" },
  { type:"question", level:"B1", text:"進め方を相手に委ねたい。", q:"最も適切な質問は？", choices:["What approach would you prefer?","Why bother choosing?","Can I decide alone?","Is approach needed?"], explain:"相手の好む進め方を尋ねる。" },
  { type:"question", level:"B2", text:"成功の指標を共有したい。", q:"最も適切な質問は？", choices:["What does good look like for you here?","Is anything good?","Why measure at all?","Can we skip goals?"], explain:"成功像を共有する問い。" },
  { type:"question", level:"C1", text:"撤退ラインを事前に決めたい。", q:"最も適切な質問は？", choices:["At what point would we walk away?","Will we ever quit?","Why set limits?","Is failure allowed?"], explain:"撤退基準を事前に問う。" },
  { type:"response", level:"B1", text:"A: Could you take notes for the meeting?", q:"自然な応答は？", choices:["Sure, I'll handle that.","Yes I note fast.","Why notes always?","Meeting is hard note."], explain:"依頼には Sure, I'll handle that. が自然。" },
  { type:"response", level:"B2", text:"A: I'm worried we're behind schedule.", q:"建設的な応答は？", choices:["Let's see what we can do to catch up.","Then work faster.","Why worry now?","That's not my fault."], explain:"挽回策を一緒に考える。" },
  { type:"response", level:"C1", text:"A: I'd push back on that assumption.", q:"自然な応答は？", choices:["Fair point—what makes you doubt it?","No, I'm right.","Why argue always?","You never agree."], explain:"異論を受け、根拠を尋ねて深める。" },
  { type:"extensive", level:"B1", text:"Tom feared cooking. He learned one simple dish at a time. After a few months, he could make a full dinner for friends without a recipe.", q:"内容に合うものは？", choices:["一品ずつ覚え、数か月でレシピ無しで夕食を作れた。","トムは料理をやめた。","上達しなかった。","友人に作らなかった。"], explain:"一品ずつ→数か月でレシピ無し夕食。" },
  { type:"extensive", level:"B2", text:"The museum made entry free on weekday evenings. Attendance soared, the gift shop's sales rose, and donations more than offset the lost ticket revenue.", q:"内容に合うものは？", choices:["平日夜の入場無料化で来場・売店・寄付が増え、減収を補った。","来場が減った。","寄付が減った。","無料化をやめた。"], explain:"平日夜無料→来場増＋売店・寄付増で減収を補填。" },
  { type:"extensive", level:"C1", text:"Dismissed early on as too niche, the podcast found its audience by going deep where others stayed shallow, eventually shaping debate in its field.", q:"内容に合うものは？", choices:["ニッチ扱いされたが、深掘りで聴衆を得て分野の議論を形作った。","すぐ終了した。","浅い内容だった。","聴衆は増えなかった。"], explain:"ニッチ扱い→深掘りで聴衆獲得→議論を形成。" }
]);

/* 増量セットW：高次スキル第12弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The gym added early-morning classes. They filled up fast with commuters, and overall membership grew as people fit workouts before work.", q:"最も適切な要約は？", choices:["早朝クラス追加で通勤者に好評、会員も増えた。","クラスを減らした。","会員が減った。","早朝は不人気だった。"], explain:"早朝クラス→通勤者に好評→会員増。" },
  { type:"summary", level:"B2", text:"The team shipped a smaller release more often instead of one big update. Bugs were easier to trace, and users adapted to changes gradually.", q:"最も適切な要約は？", choices:["小さな頻繁リリースにし、不具合追跡が容易で利用者も順応した。","大型更新に戻した。","不具合が増えた。","利用者は混乱した。"], explain:"小さく頻繁→不具合追跡容易＋利用者が順応。" },
  { type:"summary", level:"C1", text:"Rather than cut prices, the brand emphasized durability and repairs. Margins held, returns fell, and loyal customers spread the message.", q:"最も適切な要約は？", choices:["値下げせず耐久性と修理を訴求し、利益維持・返品減・口コミを得た。","大幅値下げした。","返品が増えた。","利益が落ちた。"], explain:"値下げ回避＋耐久・修理訴求→利益維持・返品減・口コミ。" },
  { type:"summary", level:"B2", text:"The office removed assigned desks. Some missed their spot, but collaboration across teams increased and space was used more efficiently.", q:"最も適切な要約は？", choices:["固定席廃止で一部は不満も、部門間連携と空間効率が向上した。","席を増やした。","連携が減った。","全員が満足した。"], explain:"固定席廃止→一部不満＋連携・効率向上。" },
  { type:"paraphrase", level:"B1", text:"Let's get back on track.", q:"ほぼ同じ意味は？", choices:["Let's return to the main topic.","Let's get on a train.","Let's stop working.","Let's go off course."], explain:"get back on track ＝ 本筋に戻る。" },
  { type:"paraphrase", level:"B2", text:"We're spinning our wheels.", q:"ほぼ同じ意味は？", choices:["We're making no progress.","We're driving fast.","We're winning easily.","We're almost done."], explain:"spin one's wheels ＝ 空回りする。" },
  { type:"paraphrase", level:"B2", text:"Let's find common ground.", q:"ほぼ同じ意味は？", choices:["Let's find what we agree on.","Let's dig the ground.","Let's separate.","Let's fight."], explain:"common ground ＝ 共通点。" },
  { type:"paraphrase", level:"C1", text:"We're at an impasse.", q:"ほぼ同じ意味は？", choices:["We're stuck with no way forward.","We're nearly finished.","We're moving fast.","We're in agreement."], explain:"impasse ＝ 行き詰まり。" },
  { type:"paraphrase", level:"B2", text:"Let's not over-index on that.", q:"ほぼ同じ意味は？", choices:["Let's not give that too much weight.","Let's index the book.","Let's ignore it fully.","Let's measure it."], explain:"over-index on ＝ 過度に重視する。" },
  { type:"intensive", level:"B2", text:"Seldom have I seen such dedication.", q:"この文の意味は？", choices:["これほどの献身はめったに見たことがない。","しょっちゅう見ている。","献身は見なかった。","少し見た。"], explain:"Seldom + 倒置で『めったに〜ない』。" },
  { type:"intensive", level:"B2", text:"On no account should you share this.", q:"On no account の意味は？", choices:["決して〜してはいけない","どんな勘定でも","状況によっては","自由に"], explain:"On no account ＋ 倒置で強い禁止。" },
  { type:"intensive", level:"C1", text:"Be that as it may, we must proceed.", q:"Be that as it may の意味は？", choices:["それはそうとしても","それが本当なら","そうであるように","それゆえに"], explain:"Be that as it may ＝ それはそうとしても（譲歩）。" },
  { type:"question", level:"B1", text:"相手の負担を確認したい。", q:"最も適切な質問は？", choices:["Is this doable for you?","Why so slow always?","Can you never finish?","Is work hard?"], explain:"doable for you で実現可能性を配慮して問う。" },
  { type:"question", level:"B2", text:"判断材料を引き出したい。", q:"最も適切な質問は？", choices:["What would help you decide?","Why can't you decide?","Is deciding hard?","Can I decide for you?"], explain:"判断を後押しする材料を尋ねる。" },
  { type:"question", level:"C1", text:"見えていない制約を確認したい。", q:"最も適切な質問は？", choices:["Are there constraints we haven't named?","Is anything limited?","Why have limits?","Can we ignore limits?"], explain:"未言及の制約を引き出す。" },
  { type:"response", level:"B1", text:"A: Can you send me the file?", q:"自然な応答は？", choices:["Sure, sending it now.","Yes file send fast.","Why file always?","Send is hard maybe."], explain:"依頼には Sure, sending it now. が自然。" },
  { type:"response", level:"B2", text:"A: I don't think this will scale.", q:"建設的な応答は？", choices:["Good point—what's the bottleneck?","Then forget it.","Why doubt always?","You never agree."], explain:"懸念を受け、ボトルネックを尋ねる。" },
  { type:"response", level:"C1", text:"A: Let's not commit just yet.", q:"自然な応答は？", choices:["Understood—what would you want to see first?","No, decide now.","Why delay always?","You never commit."], explain:"保留を受け、必要な材料を尋ねる。" },
  { type:"extensive", level:"B1", text:"Mia kept forgetting names. She started repeating each new name right after hearing it. Soon she remembered most people she met.", q:"内容に合うものは？", choices:["聞いた直後に名前を繰り返す習慣で、ほぼ覚えられるようになった。","名前を覚えるのをやめた。","効果は無かった。","誰にも会わなかった。"], explain:"直後復唱→ほぼ記憶。" },
  { type:"extensive", level:"B2", text:"The shop posted a daily 'one-minute tip' video. Each was tiny, but viewers returned daily, and the channel grew into the brand's main marketing.", q:"内容に合うものは？", choices:["毎日1分動画で視聴者が定着し、主要なマーケティングに育った。","動画をやめた。","視聴者は減った。","効果は無かった。"], explain:"毎日1分→定着→主力マーケに成長。" },
  { type:"extensive", level:"C1", text:"Written off after a slow launch, the product found new life when a single feature, almost added as an afterthought, went viral among a niche community.", q:"内容に合うものは？", choices:["低調な出だし後、付け足し機能が niche で拡散し再生した。","すぐ廃番になった。","最初から人気だった。","機能は不要だった。"], explain:"低調→付け足し機能がniche拡散→再生。" }
]);

/* 増量セットY：高次スキル第13弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The store began offering free gift wrapping. Lines got longer at first, but average purchase size grew as shoppers added small gift items.", q:"最も適切な要約は？", choices:["無料ラッピングで一時的に行列も、平均購入額が増えた。","ラッピングをやめた。","購入額が減った。","行列は消えた。"], explain:"無料ラッピング→一時行列＋平均購入額増。" },
  { type:"summary", level:"B2", text:"The company published its salary bands openly. A few employees were unhappy, but trust rose and pay-related complaints dropped sharply.", q:"最も適切な要約は？", choices:["給与帯の公開で一部は不満も、信頼が増し給与の苦情が減った。","給与を隠した。","苦情が増えた。","信頼が落ちた。"], explain:"給与公開→一部不満＋信頼向上・苦情減。" },
  { type:"summary", level:"C1", text:"By limiting each meeting to 25 minutes, the team forced sharper agendas. Some topics needed follow-ups, but overall meeting time fell by a third.", q:"最も適切な要約は？", choices:["会議を25分に制限し議題が明確化、追加もあったが総時間は3分の1減った。","会議を延長した。","議題が曖昧になった。","総時間が増えた。"], explain:"25分制限→議題明確化＋総時間3分の1減。" },
  { type:"paraphrase", level:"B1", text:"Count me in.", q:"ほぼ同じ意味は？", choices:["I'll join.","Count to ten.","I'm out.","Count the money."], explain:"Count me in ＝ 参加します。" },
  { type:"paraphrase", level:"B2", text:"Let's not jump the gun.", q:"ほぼ同じ意味は？", choices:["Let's not act too early.","Let's not buy a gun.","Let's hurry up.","Let's jump high."], explain:"jump the gun ＝ 早まる。" },
  { type:"paraphrase", level:"B2", text:"We're tracking to plan.", q:"ほぼ同じ意味は？", choices:["We're on schedule.","We're tracking animals.","We're behind.","We're lost."], explain:"tracking to plan ＝ 計画通り。" },
  { type:"paraphrase", level:"C1", text:"Let's not let perfect be the enemy of good.", q:"ほぼ同じ意味は？", choices:["Don't reject good while chasing perfect.","Perfect things are bad.","Good is the enemy.","Avoid all enemies."], explain:"完璧主義で良案を逃さない。" },
  { type:"intensive", level:"B2", text:"Not only did she finish early, but she also helped others.", q:"この文の意味は？", choices:["早く終えただけでなく他者も助けた。","早く終えなかった。","誰も助けなかった。","遅れた。"], explain:"Not only … but also ～＋倒置で『〜だけでなく』。" },
  { type:"intensive", level:"B2", text:"Come what may, we'll see it through.", q:"Come what may の意味は？", choices:["何が起ころうとも","来るものは何でも","いつか来れば","何も来ない"], explain:"Come what may ＝ 何が起ころうとも。" },
  { type:"intensive", level:"C1", text:"Little does he realize how close he came.", q:"この文の意味は？", choices:["彼はどれほど際どかったかほとんど気づいていない。","彼はよく分かっている。","彼は遠かった。","彼は気づいた。"], explain:"Little does he realize ＝ ほとんど気づいていない（倒置）。" },
  { type:"question", level:"B1", text:"相手の準備状況を確認したい。", q:"最も適切な質問は？", choices:["Are you all set?","Why not ready?","Can you ever start?","Is ready hard?"], explain:"Are you all set? で準備完了を確認。" },
  { type:"question", level:"B2", text:"優先順位の根拠を引き出したい。", q:"最も適切な質問は？", choices:["What's the thinking behind this order?","Why this order always?","Is order needed?","Can we skip order?"], explain:"順位づけの根拠を尋ねる。" },
  { type:"question", level:"C1", text:"見送る選択肢も検討したい。", q:"最も適切な質問は？", choices:["What happens if we do nothing here?","Why act at all?","Is doing nothing real?","Can we ignore this?"], explain:"『何もしない』選択肢の影響を問う。" },
  { type:"response", level:"B1", text:"A: Can you review this by noon?", q:"自然な応答は？", choices:["Sure, I'll get it done.","Yes noon review fast.","Why noon always?","Review is hard maybe."], explain:"依頼には Sure, I'll get it done. が自然。" },
  { type:"response", level:"B2", text:"A: I'm not fully convinced yet.", q:"建設的な応答は？", choices:["Understood—what would convince you?","Then forget it.","Why doubt always?","You never agree."], explain:"納得材料を尋ねて前進。" },
  { type:"response", level:"C1", text:"A: Let's keep our options open.", q:"自然な応答は？", choices:["Agreed—what should we keep on the table?","No, decide now.","Why delay always?","You never commit."], explain:"選択肢を保つ案に同意し、残す候補を尋ねる。" },
  { type:"extensive", level:"B1", text:"Leo wanted to read more. He kept a book by his bed and read two pages each night. Within a year, he had finished over a dozen books.", q:"内容に合うものは？", choices:["毎晩2ページの習慣で、1年で十数冊を読み終えた。","レオは読書をやめた。","効果はなかった。","1冊も読めなかった。"], explain:"毎晩2ページ→1年で十数冊。" },
  { type:"extensive", level:"B2", text:"The startup answered every support email personally at first. It didn't scale, but the early feedback shaped a product that needed far less support later.", q:"内容に合うものは？", choices:["初期に個別対応した結果、後に手間の少ない製品に育った。","対応をやめた。","製品は悪化した。","feedbackは無視された。"], explain:"初期の個別対応→後に手間の少ない製品へ。" },
  { type:"extensive", level:"C1", text:"Panned by critics for its slow pace, the film built a devoted following over years, its quiet style eventually praised as ahead of its time.", q:"内容に合うものは？", choices:["遅さを酷評されたが、年月をかけ支持を得て先進的と評価された。","すぐ忘れられた。","批評家に絶賛された。","支持は得られなかった。"], explain:"酷評→年月で支持→先進的と再評価。" }
]);

/* 増量セットAA：高次スキル第14弾（5倍ペース・大量） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The cafe added phone chargers at every table. Customers stayed longer, ordered more drinks, and many returned specifically for the convenience.", q:"最も適切な要約は？", choices:["各席に充電器を設置し、滞在・注文が増え再来店も生んだ。","充電器を撤去した。","客が減った。","注文が減った。"], explain:"充電器設置→滞在・注文増＋再来店。" },
  { type:"summary", level:"B1", text:"The library started a weekend storytime for kids. Attendance grew steadily, and parents began borrowing more books during visits.", q:"最も適切な要約は？", choices:["週末の読み聞かせで来館が増え、貸出も伸びた。","読み聞かせをやめた。","来館が減った。","貸出は変わらない。"], explain:"読み聞かせ→来館増＋貸出増。" },
  { type:"summary", level:"B2", text:"The team replaced status meetings with a short written update. People reclaimed hours each week, though a few missed the face-to-face contact.", q:"最も適切な要約は？", choices:["会議を書面更新に替え時間を取り戻したが、対面を惜しむ声もあった。","会議を増やした。","時間が減った。","全員が満足した。"], explain:"会議→書面更新で時間回復＋対面を惜しむ声。" },
  { type:"summary", level:"B2", text:"The shop trained staff to handle refunds on the spot. Lines moved faster, complaints dropped, and customer reviews improved noticeably.", q:"最も適切な要約は？", choices:["その場返金の訓練で行列が速まり苦情減・評価向上。","返金をやめた。","苦情が増えた。","評価が落ちた。"], explain:"その場返金訓練→行列速化・苦情減・評価向上。" },
  { type:"summary", level:"C1", text:"By publishing its roadmap, the company invited criticism but also gained valuable early feedback that prevented two costly missteps.", q:"最も適切な要約は？", choices:["ロードマップ公開で批判も招いたが、早期の助言で高くつく失敗を防いだ。","計画を隠した。","失敗が増えた。","助言は無かった。"], explain:"公開→批判＋早期助言で失敗回避。" },
  { type:"paraphrase", level:"B1", text:"I should get going.", q:"ほぼ同じ意味は？", choices:["I need to leave now.","I should go faster.","I should stay.","I will get it."], explain:"get going ＝ 出発する。" },
  { type:"paraphrase", level:"B1", text:"It's worth a try.", q:"ほぼ同じ意味は？", choices:["It's worth attempting.","It costs a lot.","It's not worth it.","Try the worth."], explain:"worth a try ＝ 試す価値がある。" },
  { type:"paraphrase", level:"B2", text:"Let's address the concerns first.", q:"ほぼ同じ意味は？", choices:["Let's deal with the worries first.","Let's give an address.","Let's ignore worries.","Let's be concerned."], explain:"address concerns ＝ 懸念に対処する。" },
  { type:"paraphrase", level:"B2", text:"We're heading the right way.", q:"ほぼ同じ意味は？", choices:["We're on the right track.","We're going home.","We're lost.","We turned around."], explain:"heading the right way ＝ 正しい方向に進む。" },
  { type:"paraphrase", level:"C1", text:"Let's plan with uncertainty in mind.", q:"ほぼ同じ意味は？", choices:["Let's plan expecting things to change.","Let's ignore the future.","Let's be certain.","Let's stop planning."], explain:"不確実性を前提に計画する。" },
  { type:"intensive", level:"B2", text:"Only after the meeting did I understand the issue.", q:"この文の意味は？", choices:["会議の後で初めて問題を理解した。","会議前に理解した。","問題は無かった。","理解しなかった。"], explain:"Only after … + 倒置で『〜して初めて』。" },
  { type:"intensive", level:"B2", text:"Such is life, as they say.", q:"Such is life の意味は？", choices:["人生とはそういうものだ","人生は素晴らしい","人生は短い","人生は終わり"], explain:"Such is life ＝ 人生とはそういうもの。" },
  { type:"intensive", level:"C1", text:"Rarely do we get a second chance like this.", q:"この文の意味は？", choices:["これほどの二度目の機会はめったにない。","よく機会がある。","機会は無い。","一度きりだ。"], explain:"Rarely + 倒置で『めったに〜ない』。" },
  { type:"intensive", level:"B2", text:"By and large, the feedback was positive.", q:"By and large の意味は？", choices:["概して","大きさで","急いで","完全に否定"], explain:"By and large ＝ 概して。" },
  { type:"question", level:"B1", text:"相手の都合を確認したい。", q:"最も適切な質問は？", choices:["Does this time work for you?","Why are you busy?","Can you never meet?","Is time hard?"], explain:"都合を尋ねる丁寧な問い。" },
  { type:"question", level:"B2", text:"次の一手の合意を取りたい。", q:"最も適切な質問は？", choices:["What should our next step be?","Why think about steps?","Is there a step?","Can we skip steps?"], explain:"次の行動を共有する問い。" },
  { type:"question", level:"C1", text:"成功と失敗の境界を確認したい。", q:"最も適切な質問は？", choices:["How will we know if this is working?","Will it ever work?","Why measure?","Can we ignore results?"], explain:"成功の判定基準を問う。" },
  { type:"response", level:"B1", text:"A: Thanks for the quick turnaround.", q:"自然な応答は？", choices:["No problem, glad it helped.","Yes turnaround fast.","Why thank me?","Quick is hard."], explain:"迅速対応への礼には No problem … が自然。" },
  { type:"response", level:"B2", text:"A: I'm worried about the timeline.", q:"建設的な応答は？", choices:["Let's see where we can buy time.","Then hurry up.","Why worry?","Not my problem."], explain:"懸念に寄り添い解決策を探る。" },
  { type:"response", level:"C1", text:"A: I'd rather not decide under pressure.", q:"自然な応答は？", choices:["Fair—how much time would help?","No, decide now.","Why hesitate?","You never decide."], explain:"圧力下の判断回避に配慮し、必要な時間を尋ねる。" },
  { type:"extensive", level:"B1", text:"Ravi wanted to speak English better. He started narrating his daily actions aloud in English. In a few months, words came to him more naturally.", q:"内容に合うものは？", choices:["日々の行動を英語で口に出す習慣で、自然に言葉が出るようになった。","ラヴィは英語をやめた。","効果は無かった。","話さなかった。"], explain:"行動を英語で実況→自然に言葉が出る。" },
  { type:"extensive", level:"B2", text:"The bakery let customers vote on next week's special. Engagement jumped, waste fell because demand was clearer, and regulars felt a sense of ownership.", q:"内容に合うものは？", choices:["翌週の特別商品を投票制にし、関与増・廃棄減・常連の当事者意識を生んだ。","投票をやめた。","廃棄が増えた。","常連が離れた。"], explain:"投票制→関与増・廃棄減・当事者意識。" },
  { type:"extensive", level:"C1", text:"Overlooked because it lacked flashy features, the app won users through sheer reliability, quietly becoming the default choice in its category.", q:"内容に合うものは？", choices:["派手さは無いが信頼性で支持され、定番になった。","すぐ消えた。","派手な機能で勝った。","支持されなかった。"], explain:"派手さ無し→信頼性で定番化。" }
]);

/* 増量セットAC：高次スキル第15弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The school let students choose two electives freely. Engagement rose, attendance improved, and more students joined after-school clubs.", q:"最も適切な要約は？", choices:["選択科目の自由化で関与・出席が上がり部活参加も増えた。","選択科目を廃止した。","出席が減った。","関与が下がった。"], explain:"選択自由化→関与・出席・部活参加増。" },
  { type:"summary", level:"B1", text:"The app introduced a daily streak counter. Users opened it more often, and many reported building steadier habits over weeks.", q:"最も適切な要約は？", choices:["連続記録機能で利用が増え、習慣化に役立った。","機能を削除した。","利用が減った。","習慣化しなかった。"], explain:"連続記録→利用増＋習慣化。" },
  { type:"summary", level:"B2", text:"The team adopted blameless postmortems. People reported issues sooner, fixes came faster, and overall reliability improved noticeably.", q:"最も適切な要約は？", choices:["非難しない事後検証で報告が早まり、修正と信頼性が向上した。","検証をやめた。","報告が遅れた。","信頼性が落ちた。"], explain:"非難なし検証→早期報告・修正・信頼性向上。" },
  { type:"summary", level:"B2", text:"The store moved popular items to the back. Shoppers walked past more displays, basket sizes grew, but some complained about the longer trip.", q:"最も適切な要約は？", choices:["人気商品を奥に置き購入点数は増えたが、動線の長さに不満も。","商品を前に置いた。","購入が減った。","不満は無かった。"], explain:"人気商品を奥へ→購入点数増＋動線の不満。" },
  { type:"summary", level:"C1", text:"By capping feature requests per quarter, the team shipped more reliably. A few wishes waited, but quality and predictability rose sharply.", q:"最も適切な要約は？", choices:["四半期の要望数を制限し、待ちは出たが品質と予測可能性が向上した。","要望を無制限にした。","品質が落ちた。","予測不能になった。"], explain:"要望制限→待ち発生＋品質・予測可能性向上。" },
  { type:"paraphrase", level:"B1", text:"That's no problem.", q:"ほぼ同じ意味は？", choices:["That's totally fine.","That's a big issue.","That's impossible.","That's a problem."], explain:"no problem ＝ 問題ない。" },
  { type:"paraphrase", level:"B1", text:"Let me get back to you.", q:"ほぼ同じ意味は？", choices:["I'll reply to you later.","Let me return to you.","I'll never reply.","Get behind you."], explain:"get back to you ＝ 折り返す。" },
  { type:"paraphrase", level:"B2", text:"Let's keep the plan realistic.", q:"ほぼ同じ意味は？", choices:["Let's keep the plan achievable.","Let's make it impossible.","Let's drop the plan.","Let's keep it real estate."], explain:"realistic ＝ 実現可能な。" },
  { type:"paraphrase", level:"B2", text:"Let me flag the risks.", q:"ほぼ同じ意味は？", choices:["Let me point out the risks.","Let me wave a flag.","Let me hide the risks.","Let me risk a flag."], explain:"flag ＝ 指摘する。" },
  { type:"paraphrase", level:"C1", text:"Let's build uncertainty into the plan.", q:"ほぼ同じ意味は？", choices:["Let's plan for things to change.","Let's be certain.","Let's avoid planning.","Let's build a wall."], explain:"不確実性を前提に計画する。" },
  { type:"intensive", level:"B2", text:"Were she here, she would agree.", q:"この文の意味は？", choices:["もし彼女がここにいれば賛成するだろう。","彼女はここにいる。","彼女は反対した。","彼女は来た。"], explain:"Were she here … は仮定法の倒置。" },
  { type:"intensive", level:"B2", text:"Time and again, the plan proved its worth.", q:"Time and again の意味は？", choices:["何度も","一度だけ","時々","二度と"], explain:"Time and again ＝ 何度も。" },
  { type:"intensive", level:"C1", text:"Scarcely had it begun when it ended.", q:"この文の意味は？", choices:["始まったかと思うとすぐ終わった。","終わってから始まった。","始まらなかった。","長く続いた。"], explain:"Scarcely … when ～＋倒置で『〜するや否や』。" },
  { type:"intensive", level:"B2", text:"All things considered, it went smoothly.", q:"All things considered の意味は？", choices:["全てを考慮すると","全部を考えずに","急いで","ばらばらに"], explain:"All things considered ＝ 全てを考慮すると。" },
  { type:"question", level:"B1", text:"相手の準備度を確認したい。", q:"最も適切な質問は？", choices:["Are we good to go?","Why not ready yet?","Can you ever start?","Is go hard?"], explain:"Are we good to go? で準備完了を確認。" },
  { type:"question", level:"B2", text:"優先順位の理由を引き出したい。", q:"最も適切な質問は？", choices:["What's driving this priority?","Why prioritize ever?","Is priority real?","Can we skip it?"], explain:"優先の駆動要因を尋ねる。" },
  { type:"question", level:"C1", text:"見送りの影響を確認したい。", q:"最も適切な質問は？", choices:["What's the cost of waiting here?","Why wait ever?","Is waiting real?","Can we ignore time?"], explain:"待つことの代償を問う。" },
  { type:"response", level:"B1", text:"A: Could you take this on?", q:"自然な応答は？", choices:["Sure, I can handle it.","Yes take fast me.","Why this always?","Take is hard maybe."], explain:"依頼には Sure, I can handle it. が自然。" },
  { type:"response", level:"B2", text:"A: I'm not sure we can hit the date.", q:"建設的な応答は？", choices:["Let's see what we can adjust.","Then work harder.","Why doubt always?","Not my problem."], explain:"期日懸念に調整策を提案。" },
  { type:"response", level:"C1", text:"A: I'd like to keep this reversible.", q:"自然な応答は？", choices:["Agreed—let's avoid one-way doors.","No, commit now.","Why hesitate?","You never decide."], explain:"後戻り可能性を保つ案に同意。" },
  { type:"extensive", level:"B1", text:"Ken was shy about speaking up. He set a goal to ask one question in every meeting. Over time, sharing his ideas felt natural.", q:"内容に合うものは？", choices:["毎回1問する目標で、意見共有が自然になった。","ケンは発言をやめた。","変化は無かった。","会議に出なかった。"], explain:"毎回1問→意見共有が自然に。" },
  { type:"extensive", level:"B2", text:"The team shipped a rough version early and improved it weekly. Users felt heard, bugs surfaced sooner, and the final product fit real needs better.", q:"内容に合うものは？", choices:["粗い版を早く出し毎週改善、利用者の声を反映し実需に合った。","完成まで出さなかった。","バグが増えた。","声を無視した。"], explain:"早期リリース＋週次改善→実需に適合。" },
  { type:"extensive", level:"C1", text:"Initially mocked as a toy, the simple tool spread precisely because anyone could learn it in minutes, eventually outlasting complex rivals.", q:"内容に合うものは？", choices:["玩具と嘲られたが、誰でもすぐ使える点で広まり長く残った。","すぐ消えた。","複雑な競合が勝った。","誰も使えなかった。"], explain:"玩具扱い→学びやすさで普及→長寿。" }
]);

/* 増量セットAE：高次スキル第16弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The town added bike lanes downtown. More people cycled to work, traffic eased slightly, and local shops saw more foot traffic.", q:"最も適切な要約は？", choices:["自転車レーン設置で通勤自転車が増え、渋滞緩和と来店増を生んだ。","レーンを撤去した。","渋滞が悪化した。","来店が減った。"], explain:"自転車レーン→通勤自転車増・渋滞緩和・来店増。" },
  { type:"summary", level:"B1", text:"The team began a short daily check-in. Small issues surfaced earlier, and people felt more connected to each other's work.", q:"最も適切な要約は？", choices:["短い日次確認で問題が早く表面化し連帯感も増した。","確認をやめた。","問題が隠れた。","孤立が進んだ。"], explain:"日次確認→早期発見＋連帯感。" },
  { type:"summary", level:"B2", text:"The store let staff resolve complaints without manager approval up to a limit. Resolutions sped up, and customer satisfaction rose.", q:"最も適切な要約は？", choices:["一定額まで現場判断で苦情解決を許可し、迅速化と満足度向上を得た。","判断を禁じた。","解決が遅れた。","満足度が下がった。"], explain:"現場判断許可→迅速化・満足度向上。" },
  { type:"summary", level:"B2", text:"The publisher released chapters weekly instead of a full book. Readers stayed engaged longer, and feedback shaped later chapters.", q:"最も適切な要約は？", choices:["章を毎週公開し、関与が続き意見が後の章に反映された。","一括公開した。","関与が減った。","意見は無視された。"], explain:"週次公開→関与継続＋意見反映。" },
  { type:"summary", level:"C1", text:"By auditing its own assumptions quarterly, the firm caught two outdated beliefs that were quietly steering bad decisions.", q:"最も適切な要約は？", choices:["四半期ごとに前提を点検し、誤判断を招く時代遅れの思い込みを2つ発見した。","点検をやめた。","思い込みは正しかった。","判断は完璧だった。"], explain:"前提の定期点検→誤判断の元を発見。" },
  { type:"paraphrase", level:"B1", text:"There's no rush.", q:"ほぼ同じ意味は？", choices:["Take your time.","Hurry up.","It's urgent.","Run fast."], explain:"no rush ＝ 急がなくていい。" },
  { type:"paraphrase", level:"B1", text:"It's up to you.", q:"ほぼ同じ意味は？", choices:["You can decide.","I'll decide.","It's upstairs.","It's required."], explain:"up to you ＝ あなた次第。" },
  { type:"paraphrase", level:"B2", text:"Let's get on the same page.", q:"ほぼ同じ意味は？", choices:["Let's reach a shared understanding.","Let's read the page.","Let's disagree.","Let's turn the page."], explain:"same page ＝ 認識を合わせる。" },
  { type:"paraphrase", level:"B2", text:"That's within expectations.", q:"ほぼ同じ意味は？", choices:["That's what we anticipated.","That's a surprise.","That's forbidden.","That's outside."], explain:"within expectations ＝ 想定内。" },
  { type:"paraphrase", level:"C1", text:"This warrants careful handling.", q:"ほぼ同じ意味は？", choices:["This needs to be handled carefully.","This is a warranty.","This is careless.","This is easy."], explain:"warrant ＝ 〜を必要とする。" },
  { type:"intensive", level:"B2", text:"Not until later did it make sense.", q:"この文の意味は？", choices:["後になって初めて意味が通った。","すぐ理解した。","意味は無かった。","早く分かった。"], explain:"Not until … + 倒置で『〜して初めて』。" },
  { type:"intensive", level:"B2", text:"In no way is this acceptable.", q:"In no way の意味は？", choices:["決して〜ない","どんな道でも","ある意味で","完全に"], explain:"In no way + 倒置で強い否定。" },
  { type:"intensive", level:"C1", text:"So compelling was the case that no one objected.", q:"この文の意味は？", choices:["論拠が説得力に満ち、誰も反対しなかった。","誰もが反対した。","論拠は弱かった。","沈黙が続いた。"], explain:"So + 形容詞 + 倒置で『非常に〜なので』。" },
  { type:"intensive", level:"B2", text:"For the most part, it ran smoothly.", q:"For the most part の意味は？", choices:["大部分は","少しだけ","全く〜ない","急いで"], explain:"For the most part ＝ 大部分は。" },
  { type:"question", level:"B1", text:"相手の理解度を確認したい。", q:"最も適切な質問は？", choices:["Does that make sense so far?","Why don't you get it?","Can you ever understand?","Is sense hard?"], explain:"Does that make sense? で理解を確認。" },
  { type:"question", level:"B2", text:"判断の前提を引き出したい。", q:"最も適切な質問は？", choices:["What are we assuming here?","Why assume always?","Are assumptions real?","Can we skip them?"], explain:"前提を明示させる問い。" },
  { type:"question", level:"C1", text:"成功の判定方法を確認したい。", q:"最も適切な質問は？", choices:["How will we measure success here?","Will it ever work?","Why measure?","Can we ignore it?"], explain:"成功の測定方法を問う。" },
  { type:"response", level:"B1", text:"A: Could you help me move this?", q:"自然な応答は？", choices:["Sure, where to?","Yes move fast me.","Why move always?","Move is hard maybe."], explain:"依頼には Sure, where to? が自然。" },
  { type:"response", level:"B2", text:"A: I'm not convinced this scales.", q:"建設的な応答は？", choices:["Fair—what's the bottleneck you see?","Then drop it.","Why doubt?","Not my issue."], explain:"懸念を受け、ボトルネックを尋ねる。" },
  { type:"response", level:"C1", text:"A: Let's keep our options open here.", q:"自然な応答は？", choices:["Agreed—what should we keep on the table?","No, commit now.","Why delay?","You never decide."], explain:"選択肢保持に同意し、残す候補を尋ねる。" },
  { type:"extensive", level:"B1", text:"Aya feared math. She practiced ten minutes daily with simple problems. By the term's end, her grades had clearly improved.", q:"内容に合うものは？", choices:["毎日10分の練習で、学期末に成績が明確に上がった。","アヤは数学をやめた。","成績は下がった。","練習しなかった。"], explain:"毎日10分→学期末に成績向上。" },
  { type:"extensive", level:"B2", text:"The cafe printed its values on each cup. Some ignored it, but many customers said it made them feel part of something larger.", q:"内容に合うものは？", choices:["カップに理念を印刷し、多くの客が一体感を感じた。","印刷をやめた。","客は離れた。","効果は無かった。"], explain:"理念印刷→一体感を醸成。" },
  { type:"extensive", level:"C1", text:"Dismissed as too plain at launch, the design aged remarkably well, its restraint looking wise as flashier rivals quickly felt dated.", q:"内容に合うものは？", choices:["地味と退けられたが、抑制が古びず、派手な競合より長く通用した。","すぐ消えた。","競合が勝った。","派手さで成功した。"], explain:"地味→抑制が古びず長く通用。" }
]);

/* 増量セットAG：高次スキル第17弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The gym offered free trial classes. Many newcomers signed up, several stayed as members, and word of mouth brought even more.", q:"最も適切な要約は？", choices:["無料体験で新規が集まり会員定着と口コミ拡大を生んだ。","体験をやめた。","会員が減った。","口コミは無かった。"], explain:"無料体験→新規・定着・口コミ。" },
  { type:"summary", level:"B1", text:"The office switched to standing desks. A few disliked them, but most reported less back pain and better focus by afternoon.", q:"最も適切な要約は？", choices:["立ち机導入で多くが腰痛軽減と集中向上を報告した。","机を撤去した。","腰痛が増えた。","集中が落ちた。"], explain:"立ち机→腰痛軽減・集中向上。" },
  { type:"summary", level:"B2", text:"The brand admitted a product flaw publicly and offered free repairs. Trust dipped briefly, then rose above its previous level.", q:"最も適切な要約は？", choices:["欠陥を公表し無料修理を提供、信頼は一時下がるも以前より高まった。","欠陥を隠した。","信頼は下がり続けた。","修理を拒んだ。"], explain:"公表＋無料修理→一時低下後に信頼向上。" },
  { type:"summary", level:"B2", text:"The library extended weekend hours. Student visits climbed, study groups formed, and the quiet space eased exam stress.", q:"最も適切な要約は？", choices:["週末の開館延長で来館・自習が増え試験ストレスを和らげた。","時間を短縮した。","来館が減った。","ストレスが増えた。"], explain:"開館延長→来館・自習増・ストレス緩和。" },
  { type:"summary", level:"C1", text:"By rotating team leadership monthly, the group spread skills widely; output dipped at first but resilience and buy-in rose markedly.", q:"最も適切な要約は？", choices:["月替わりのリーダー制で技能が広がり、当初は低下も回復力と当事者意識が向上した。","リーダーを固定した。","技能が偏った。","当事者意識が低下した。"], explain:"輪番リーダー→技能拡散・回復力・当事者意識向上。" },
  { type:"paraphrase", level:"B1", text:"So far so good.", q:"ほぼ同じ意味は？", choices:["Things are fine up to now.","Go far and good.","It's bad so far.","Good is far away."], explain:"so far so good ＝ 今のところ順調。" },
  { type:"paraphrase", level:"B1", text:"I'll be in touch.", q:"ほぼ同じ意味は？", choices:["I'll contact you.","I'll touch it.","I'll stay away.","I'll be busy."], explain:"be in touch ＝ 連絡する。" },
  { type:"paraphrase", level:"B2", text:"Let's take stock of where we are.", q:"ほぼ同じ意味は？", choices:["Let's assess our situation.","Let's buy stock.","Let's stop here.","Let's take a break."], explain:"take stock ＝ 状況を整理する。" },
  { type:"paraphrase", level:"B2", text:"That's non-negotiable for me.", q:"ほぼ同じ意味は？", choices:["I won't compromise on that.","Let's negotiate that.","That's negotiable.","I don't care about that."], explain:"non-negotiable ＝ 譲れない。" },
  { type:"paraphrase", level:"C1", text:"Let's make the plan robust to uncertainty.", q:"ほぼ同じ意味は？", choices:["Let's make the plan handle the unknown well.","Let's make it weak.","Let's ignore the future.","Let's stop planning."], explain:"robust to uncertainty ＝ 不確実性に強い。" },
  { type:"intensive", level:"B2", text:"No sooner had we arrived than it rained.", q:"この文の意味は？", choices:["着いた途端に雨が降った。","着く前に雨が降った。","雨は降らなかった。","遅れて降った。"], explain:"No sooner … than ～＋倒置で『〜するや否や』。" },
  { type:"intensive", level:"B2", text:"At no point did they give up.", q:"At no point の意味は？", choices:["一度も〜なかった","ある時点で","終始ずっと","遅れて"], explain:"At no point + 倒置で強い否定。" },
  { type:"intensive", level:"C1", text:"Such was her resolve that nothing could stop her.", q:"この文の意味は？", choices:["決意が固く、何も彼女を止められなかった。","決意は弱かった。","何かが止めた。","彼女は諦めた。"], explain:"Such was … that ～で『非常に〜なので』。" },
  { type:"intensive", level:"B2", text:"More often than not, it works.", q:"More often than not の意味は？", choices:["たいていは","めったに〜ない","時々","決して"], explain:"More often than not ＝ たいてい。" },
  { type:"question", level:"B1", text:"進め方の合意を取りたい。", q:"最も適切な質問は？", choices:["Shall we proceed this way?","Why proceed always?","Can we ever start?","Is way hard?"], explain:"Shall we …? で進め方の合意を取る。" },
  { type:"question", level:"B2", text:"判断の優先軸を引き出したい。", q:"最も適切な質問は？", choices:["What should we optimize for here?","Why optimize ever?","Is it optimal?","Can we skip it?"], explain:"何を最適化すべきかを問う。" },
  { type:"question", level:"C1", text:"撤退条件を確認したい。", q:"最も適切な質問は？", choices:["What would make us stop this?","Why stop ever?","Is stopping real?","Can we ignore it?"], explain:"撤退の判断基準を問う。" },
  { type:"response", level:"B1", text:"A: Can you send it by tonight?", q:"自然な応答は？", choices:["Sure, I'll send it before then.","Yes send fast night.","Why tonight always?","Send is hard maybe."], explain:"依頼には Sure, I'll send it … が自然。" },
  { type:"response", level:"B2", text:"A: I worry this is too ambitious.", q:"建設的な応答は？", choices:["Let's see what we can scope down.","Then give up.","Why worry?","Not my problem."], explain:"野心的すぎる懸念に縮小案を提案。" },
  { type:"response", level:"C1", text:"A: I'd rather test before we commit.", q:"自然な応答は？", choices:["Agreed—let's run a small pilot first.","No, commit now.","Why test?","You never decide."], explain:"検証優先に同意し、小規模試行を提案。" },
  { type:"extensive", level:"B1", text:"Sam disliked writing. He started a one-line diary each night. Months later, longer entries flowed easily and he enjoyed it.", q:"内容に合うものは？", choices:["毎晩一行日記から始め、数か月後には長文も楽しめた。","サムは書くのをやめた。","変化は無かった。","日記は続かなかった。"], explain:"一行日記→数か月で長文も楽に。" },
  { type:"extensive", level:"B2", text:"The startup open-sourced its core tool. Competitors could copy it, but a community formed that improved the tool faster than any rival.", q:"内容に合うものは？", choices:["中核ツールを公開し、模倣の risk より速い改善を生む共同体ができた。","公開をやめた。","改善が止まった。","共同体は消えた。"], explain:"オープンソース化→共同体で高速改善。" },
  { type:"extensive", level:"C1", text:"Criticized for moving slowly, the agency's deliberate pace meant it rarely reversed decisions, ultimately saving years of rework.", q:"内容に合うものは？", choices:["遅さを批判されたが、熟慮ゆえに撤回が少なく手戻りを大幅に省いた。","すぐ撤回した。","手戻りが増えた。","批判で崩れた。"], explain:"熟慮の遅さ→撤回減・手戻り削減。" }
]);

/* 増量セットAI：高次スキル第18弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The shop posted clear allergen labels. Customers with allergies felt safer, asked fewer questions, and recommended it to friends.", q:"最も適切な要約は？", choices:["明確なアレルゲン表示で安心感が増し紹介も生まれた。","表示をやめた。","客が減った。","質問が増えた。"], explain:"アレルゲン表示→安心・紹介増。" },
  { type:"summary", level:"B2", text:"The team paired junior and senior staff on tasks. Onboarding sped up, knowledge spread, though senior output dipped slightly at first.", q:"最も適切な要約は？", choices:["新人と先輩を組ませ、習得が速まり知識も広がった（当初は先輩の産出やや低下）。","組み合わせをやめた。","習得が遅れた。","知識が偏った。"], explain:"ペア制→習得加速・知識拡散。" },
  { type:"summary", level:"C1", text:"By writing decisions down with their reasons, the group could later see which judgments aged well and learn from those that didn't.", q:"最も適切な要約は？", choices:["決定と理由を記録し、後に判断の良否を学べた。","記録をやめた。","判断は不変だった。","学びは無かった。"], explain:"理由つき記録→後から学習可能。" },
  { type:"paraphrase", level:"B1", text:"It's your call.", q:"ほぼ同じ意味は？", choices:["You decide.","Call me.","It's my turn.","It's a phone call."], explain:"your call ＝ あなたが決める。" },
  { type:"paraphrase", level:"B2", text:"That's the crux of it.", q:"ほぼ同じ意味は？", choices:["That's the key issue.","That's the cross.","That's irrelevant.","That's the end."], explain:"crux ＝ 核心。" },
  { type:"paraphrase", level:"C1", text:"Let's prioritize reversibility.", q:"ほぼ同じ意味は？", choices:["Let's prefer choices we can undo.","Let's make it permanent.","Let's reverse the car.","Let's stop choosing."], explain:"reversibility ＝ 後戻りできること。" },
  { type:"intensive", level:"B2", text:"Hardly had I spoken when the lights went out.", q:"この文の意味は？", choices:["話し終えるや否や明かりが消えた。","話す前に消えた。","明かりは消えなかった。","遅れて消えた。"], explain:"Hardly … when ～＋倒置で『〜するや否や』。" },
  { type:"intensive", level:"C1", text:"Only by working together can we succeed.", q:"この文の意味は？", choices:["協力して初めて成功できる。","一人で成功する。","成功できない。","協力は不要だ。"], explain:"Only by … + 倒置で『〜して初めて』。" },
  { type:"question", level:"B1", text:"次回の予定を確認したい。", q:"最も適切な質問は？", choices:["When should we meet next?","Why meet again?","Can we never meet?","Is next hard?"], explain:"次回の予定を尋ねる。" },
  { type:"question", level:"C1", text:"前提の妥当性を確認したい。", q:"最も適切な質問は？", choices:["Is that assumption still valid?","Why assume?","Is it real?","Can we skip it?"], explain:"前提が今も妥当かを問う。" },
  { type:"response", level:"B1", text:"A: Thanks for catching that error.", q:"自然な応答は？", choices:["No problem, glad I spotted it.","Yes error fast me.","Why thank me?","Error is hard."], explain:"指摘への礼には No problem … が自然。" },
  { type:"response", level:"C1", text:"A: Let's not over-engineer this.", q:"自然な応答は？", choices:["Agreed—let's keep it simple.","No, add more.","Why simple?","You never build."], explain:"作り込みすぎ回避に同意。" },
  { type:"extensive", level:"B2", text:"The cafe trained baristas to remember regulars' orders. Regulars felt valued, visited more often, and tips rose noticeably.", q:"内容に合うものは？", choices:["常連の注文を覚える訓練で、来店とチップが増えた。","訓練をやめた。","常連が減った。","チップが減った。"], explain:"注文記憶→来店・チップ増。" },
  { type:"extensive", level:"C1", text:"Mocked for its tiny screen, the device thrived because that constraint forced a focus on doing one thing extremely well.", q:"内容に合うものは？", choices:["小画面を嘲られたが、制約ゆえ一点集中で成功した。","すぐ消えた。","多機能で勝った。","制約で失敗した。"], explain:"制約→一点集中で成功。" }
]);

/* 増量セットAK：高次スキル第19弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The school added a quiet study room. Noise complaints fell, grades edged up, and students said they could finally focus.", q:"最も適切な要約は？", choices:["静かな自習室で騒音苦情が減り集中と成績が改善した。","部屋を撤去した。","苦情が増えた。","集中できなくなった。"], explain:"静かな自習室→苦情減・集中・成績向上。" },
  { type:"summary", level:"B2", text:"The company replaced annual reviews with monthly check-ins. Feedback became timely, surprises vanished, and trust between managers and staff grew.", q:"最も適切な要約は？", choices:["年次評価を月次面談に替え、適時の助言と信頼向上を得た。","評価をやめた。","助言が遅れた。","信頼が落ちた。"], explain:"月次面談→適時助言・信頼向上。" },
  { type:"summary", level:"C1", text:"By deliberately seeking dissent, the leader surfaced hidden risks early, turning quiet doubts into useful course corrections.", q:"最も適切な要約は？", choices:["あえて異論を求め、隠れたリスクを早期に表面化し軌道修正に活かした。","異論を封じた。","リスクが隠れた。","修正は無かった。"], explain:"異論を求める→隠れリスクの早期発見。" },
  { type:"paraphrase", level:"B1", text:"It's hard to say.", q:"ほぼ同じ意味は？", choices:["I'm not certain.","It's loud.","It's easy.","Say it hard."], explain:"hard to say ＝ 何とも言えない。" },
  { type:"paraphrase", level:"B2", text:"Let's strike a balance.", q:"ほぼ同じ意味は？", choices:["Let's find a middle ground.","Let's hit hard.","Let's lose balance.","Let's strike out."], explain:"strike a balance ＝ 均衡を取る。" },
  { type:"paraphrase", level:"C1", text:"Let's design for uncertainty.", q:"ほぼ同じ意味は？", choices:["Let's plan so change won't break us.","Let's ignore risk.","Let's be certain.","Let's stop designing."], explain:"不確実性を前提に設計する。" },
  { type:"intensive", level:"B2", text:"Seldom have I seen such effort.", q:"この文の意味は？", choices:["これほどの努力はめったに見ない。","よく見る。","努力は無かった。","一度だけ見た。"], explain:"Seldom + 倒置で『めったに〜ない』。" },
  { type:"intensive", level:"C1", text:"Not only was it late, but it was also wrong.", q:"この文の意味は？", choices:["遅れただけでなく間違ってもいた。","遅れなかった。","正しかった。","早かった。"], explain:"Not only … but also ～＋倒置で強調。" },
  { type:"question", level:"B1", text:"相手の同意を確認したい。", q:"最も適切な質問は？", choices:["Are we on the same page?","Why agree always?","Can we ever agree?","Is page hard?"], explain:"認識一致を確認する問い。" },
  { type:"question", level:"C1", text:"判断の可逆性を確認したい。", q:"最も適切な質問は？", choices:["Can we undo this if it's wrong?","Why undo ever?","Is undo real?","Can we ignore it?"], explain:"後戻りできるかを問う。" },
  { type:"response", level:"B1", text:"A: Could you double-check this?", q:"自然な応答は？", choices:["Sure, I'll go over it now.","Yes check fast me.","Why this always?","Check is hard maybe."], explain:"依頼には Sure, I'll go over it now. が自然。" },
  { type:"response", level:"C1", text:"A: Let's not lose sight of the goal.", q:"自然な応答は？", choices:["Agreed—let's keep the end in mind.","No, forget it.","Why focus?","You never aim."], explain:"目標を見失わない案に同意。" },
  { type:"extensive", level:"B2", text:"The team wrote a one-page summary after each project. New members ramped up faster, and old mistakes stopped repeating.", q:"内容に合うものは？", choices:["毎回の1枚要約で、新人の立ち上がりが速まり失敗の再発が減った。","要約をやめた。","立ち上がりが遅れた。","失敗が増えた。"], explain:"1枚要約→新人加速・失敗再発防止。" },
  { type:"extensive", level:"C1", text:"Written off for lacking polish, the rough prototype won funding precisely because it proved the core idea worked in the real world.", q:"内容に合うものは？", choices:["粗削りと退けられたが、中核の有効性を実証し資金を得た。","すぐ消えた。","磨きで勝った。","実証できなかった。"], explain:"粗削り→中核実証で資金獲得。" }
]);

/* 増量セットAM：高次スキル第20弾 大量（5倍ペース完全維持） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The cafe started a loyalty card. Regulars came more often, average spend rose, and staff learned customers' names and orders.", q:"最も適切な要約は？", choices:["ポイントカードで再来店と客単価が上がり関係も深まった。","カードを廃止した。","客が減った。","客単価が下がった。"], explain:"ポイントカード→再来店・客単価・関係向上。" },
  { type:"summary", level:"B1", text:"The class switched to group projects. Quiet students spoke up more, ideas improved through discussion, and friendships formed.", q:"最も適切な要約は？", choices:["グループ制で発言・議論・交友が増えた。","個人制に戻した。","発言が減った。","孤立が進んだ。"], explain:"グループ制→発言・議論・交友増。" },
  { type:"summary", level:"B2", text:"The company published its salary bands openly. Negotiations got simpler, perceived fairness rose, and turnover among mid-level staff fell.", q:"最も適切な要約は？", choices:["給与帯の公開で交渉が簡素化し公平感が増え離職が減った。","給与を隠した。","交渉が複雑化した。","離職が増えた。"], explain:"給与公開→交渉簡素化・公平感・離職減。" },
  { type:"summary", level:"B2", text:"The team adopted a no-meeting Wednesday. Deep work increased, output on complex tasks improved, and people felt less drained midweek.", q:"最も適切な要約は？", choices:["会議なし水曜で集中作業が増え複雑な成果と活力が向上した。","会議を増やした。","集中が減った。","疲労が増えた。"], explain:"会議なし日→集中・成果・活力向上。" },
  { type:"summary", level:"C1", text:"By measuring outcomes rather than hours, the firm rewarded results over presence; productivity rose and unnecessary overtime quietly disappeared.", q:"最も適切な要約は？", choices:["労働時間でなく成果で評価し、生産性が上がり無駄な残業が消えた。","時間で評価した。","生産性が落ちた。","残業が増えた。"], explain:"成果評価→生産性向上・残業減。" },
  { type:"paraphrase", level:"B1", text:"That's the spirit.", q:"ほぼ同じ意味は？", choices:["That's the right attitude.","That's a ghost.","That's wrong.","That's the alcohol."], explain:"That's the spirit. ＝ その意気だ。" },
  { type:"paraphrase", level:"B1", text:"I'll get through it somehow.", q:"ほぼ同じ意味は？", choices:["I'll manage it one way or another.","I'll give up.","I'll go through the door.","I'll fail it."], explain:"get through ＝ 乗り切る。" },
  { type:"paraphrase", level:"B2", text:"It's a gray area.", q:"ほぼ同じ意味は？", choices:["It's not clearly defined.","It's a colored zone.","It's perfectly clear.","It's an old place."], explain:"gray area ＝ 曖昧な領域。" },
  { type:"paraphrase", level:"B2", text:"Let me flag a concern.", q:"ほぼ同じ意味は？", choices:["Let me point out a worry.","Let me wave a flag.","Let me hide a worry.","Let me color it."], explain:"flag ＝ 指摘する。" },
  { type:"paraphrase", level:"C1", text:"Let's make the trade-offs explicit.", q:"ほぼ同じ意味は？", choices:["Let's clearly state what we give up.","Let's trade openly.","Let's hide the costs.","Let's stop trading."], explain:"trade-offs explicit ＝ 犠牲を明示する。" },
  { type:"intensive", level:"B2", text:"Rarely do we see such dedication.", q:"この文の意味は？", choices:["これほどの献身はめったに見ない。","よく見る。","献身は無かった。","一度だけ見た。"], explain:"Rarely + 倒置で『めったに〜ない』。" },
  { type:"intensive", level:"B2", text:"Little did she know the truth.", q:"この文の意味は？", choices:["彼女は真実をほとんど知らなかった。","真実をよく知っていた。","真実は無かった。","少し知っていた。"], explain:"Little did … know で『ほとんど知らなかった』。" },
  { type:"intensive", level:"C1", text:"Were it not for your help, we'd have failed.", q:"この文の意味は？", choices:["あなたの助けがなければ失敗していた。","助けがあって失敗した。","助けは不要だった。","成功した。"], explain:"Were it not for … は仮定法の倒置。" },
  { type:"intensive", level:"B2", text:"By and large, the plan worked.", q:"By and large の意味は？", choices:["概して","大きく分けて","急いで","めったに"], explain:"By and large ＝ 概して。" },
  { type:"question", level:"B1", text:"相手の準備状況を尋ねたい。", q:"最も適切な質問は？", choices:["Are you all set?","Why ready always?","Can you ever prepare?","Is set hard?"], explain:"Are you all set? で準備を確認。" },
  { type:"question", level:"B2", text:"判断の判断軸を引き出したい。", q:"最も適切な質問は？", choices:["What matters most in this decision?","Why decide ever?","Is it decided?","Can we skip it?"], explain:"判断で重視すべき点を問う。" },
  { type:"question", level:"C1", text:"撤退ラインを確認したい。", q:"最も適切な質問は？", choices:["At what point should we walk away?","Why walk ever?","Is walking real?","Can we ignore it?"], explain:"撤退の判断ラインを問う。" },
  { type:"response", level:"B1", text:"A: Could you take notes today?", q:"自然な応答は？", choices:["Sure, I'll handle that.","Yes note fast me.","Why notes always?","Note is hard maybe."], explain:"依頼には Sure, I'll handle that. が自然。" },
  { type:"response", level:"B2", text:"A: I'm worried we're overcommitting.", q:"建設的な応答は？", choices:["Let's see what we can trim.","Then quit.","Why worry?","Not my issue."], explain:"過剰約束の懸念に削減案を提案。" },
  { type:"response", level:"C1", text:"A: Let's keep this decision reversible.", q:"自然な応答は？", choices:["Agreed—let's avoid locking ourselves in.","No, commit fully.","Why hesitate?","You never decide."], explain:"可逆性を保つ案に同意。" },
  { type:"extensive", level:"B1", text:"Yuki was shy in English. She joined a weekly conversation club. After three months, she spoke with far more confidence.", q:"内容に合うものは？", choices:["週1の会話クラブで、3か月後に自信を持って話せた。","ユキは英語をやめた。","変化は無かった。","クラブは続かなかった。"], explain:"週1クラブ→3か月で自信向上。" },
  { type:"extensive", level:"B2", text:"The bakery shared its recipes freely online. Rather than losing sales, it gained loyal fans who valued the openness and visited even more.", q:"内容に合うものは？", choices:["レシピを無料公開し、開放性を評価する常連が増えた。","公開をやめた。","売上が激減した。","客が離れた。"], explain:"レシピ公開→開放性で常連増。" },
  { type:"extensive", level:"C1", text:"Initially dismissed as overly cautious, the auditor's habit of documenting every assumption later saved the firm during a critical dispute.", q:"内容に合うものは？", choices:["慎重すぎと退けられたが、前提の記録が後に重大な紛争で会社を救った。","記録をやめた。","紛争で負けた。","慎重さが裏目に出た。"], explain:"前提記録の習慣→紛争時に会社を救う。" }
]);

/* 増量セットAO：高次スキル第21弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The office added plants and better lighting. Workers reported less eye strain, a calmer mood, and slightly higher focus through the day.", q:"最も適切な要約は？", choices:["植物と照明改善で疲労減・気分・集中が向上した。","植物を撤去した。","疲労が増えた。","集中が落ちた。"], explain:"植物・照明→疲労減・気分・集中向上。" },
  { type:"summary", level:"B2", text:"The startup let users vote on new features. Engagement rose, the roadmap matched real needs, and users felt genuine ownership.", q:"最も適切な要約は？", choices:["機能投票で関与が増え、実需に沿い当事者意識も高まった。","投票を廃止した。","関与が減った。","実需とずれた。"], explain:"機能投票→関与・実需適合・当事者意識。" },
  { type:"summary", level:"C1", text:"By rewarding questions as much as answers, the teacher built a class unafraid to admit confusion, which deepened everyone's understanding.", q:"最も適切な要約は？", choices:["質問も答え同様に評価し、混乱を認めやすい雰囲気で理解が深まった。","質問を罰した。","理解が浅まった。","沈黙が増えた。"], explain:"質問を評価→混乱を認めやすく理解深化。" },
  { type:"paraphrase", level:"B1", text:"I didn't catch that.", q:"ほぼ同じ意味は？", choices:["I didn't hear that clearly.","I didn't grab it.","I caught a cold.","I understood fully."], explain:"didn't catch ＝ 聞き取れなかった。" },
  { type:"paraphrase", level:"B2", text:"That's a stretch.", q:"ほぼ同じ意味は？", choices:["That's hard to believe.","That's flexible.","That's obvious.","That's a long walk."], explain:"a stretch ＝ こじつけ・無理がある。" },
  { type:"paraphrase", level:"C1", text:"That's begging the question.", q:"ほぼ同じ意味は？", choices:["That assumes what it tries to prove.","That asks a question.","That answers fully.","That begs for money."], explain:"begging the question ＝ 論点先取。" },
  { type:"intensive", level:"B2", text:"Only then did it make sense.", q:"この文の意味は？", choices:["その時になって初めて意味が通った。","すぐ分かった。","意味は無かった。","早く分かった。"], explain:"Only then + 倒置で『その時初めて』。" },
  { type:"intensive", level:"C1", text:"Such was the demand that stocks ran out.", q:"この文の意味は？", choices:["需要が大きく在庫が尽きた。","需要は小さかった。","在庫は余った。","売れなかった。"], explain:"Such was … that ～で『非常に〜なので』。" },
  { type:"question", level:"B1", text:"理解度を確認したい。", q:"最も適切な質問は？", choices:["Am I making sense?","Why confused always?","Can you ever follow?","Is sense hard?"], explain:"Am I making sense? で理解を確認。" },
  { type:"question", level:"C1", text:"主張の反証条件を問いたい。", q:"最も適切な質問は？", choices:["What would prove this wrong?","Why wrong ever?","Is it provable?","Can we skip it?"], explain:"反証条件を問い議論を厳密にする。" },
  { type:"response", level:"B1", text:"A: Could you summarize this?", q:"自然な応答は？", choices:["Sure, here's the gist.","Yes sum fast me.","Why summary always?","Sum is hard maybe."], explain:"依頼には Sure, here's the gist. が自然。" },
  { type:"response", level:"C1", text:"A: Let's base this on evidence, not hunches.", q:"自然な応答は？", choices:["Agreed—what does the data show?","No, trust feelings.","Why evidence?","You never decide."], explain:"証拠重視に同意し、データを尋ねる。" },
  { type:"extensive", level:"B2", text:"The library let patrons suggest purchases. Circulation rose, niche interests were served, and patrons felt the collection was truly theirs.", q:"内容に合うものは？", choices:["購入希望を募り、貸出増・少数の関心充足・帰属感を生んだ。","希望を無視した。","貸出が減った。","帰属感が薄れた。"], explain:"購入希望→貸出増・関心充足・帰属感。" },
  { type:"extensive", level:"C1", text:"Faulted for being slow to launch, the team's long beta caught subtle bugs that would have alienated users, earning lasting goodwill instead.", q:"内容に合うものは？", choices:["公開の遅さを責められたが、長いベータで重大バグを除き信頼を得た。","ベータをやめた。","バグが残った。","信頼を失った。"], explain:"長いベータ→重大バグ除去→信頼獲得。" }
]);

/* 増量セットAQ：高次スキル第22弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The shop offered to gift-wrap for free. More customers bought presents there, returns dropped, and many became repeat buyers.", q:"最も適切な要約は？", choices:["無料ギフト包装で贈答購入が増え返品減と再来店を生んだ。","包装をやめた。","購入が減った。","返品が増えた。"], explain:"無料包装→贈答購入増・返品減・再来店。" },
  { type:"summary", level:"B2", text:"The team rotated who ran the meeting. Facilitation skills spread, meetings got tighter, and more voices were heard over time.", q:"最も適切な要約は？", choices:["司会を輪番にし、技能が広がり会議が締まり多様な声が出た。","司会を固定した。","会議が冗長化した。","声が偏った。"], explain:"司会輪番→技能拡散・会議改善・多様な声。" },
  { type:"summary", level:"C1", text:"By separating idea generation from evaluation, the workshop let wild ideas survive long enough to be refined into practical ones.", q:"最も適切な要約は？", choices:["発想と評価を分け、奇抜な案が練られて実用化した。","発想を即評価した。","案が消えた。","実用化しなかった。"], explain:"発想と評価の分離→奇抜案が実用化。" },
  { type:"paraphrase", level:"B1", text:"Will that be all?", q:"ほぼ同じ意味は？", choices:["Is there anything else?","Will it end?","Is that everything wrong?","Are you all here?"], explain:"Will that be all? ＝ 以上でよろしいですか。" },
  { type:"paraphrase", level:"B2", text:"That's the crux of the matter.", q:"ほぼ同じ意味は？", choices:["That's the central issue.","That's the cross.","That's irrelevant.","That's the matter ending."], explain:"crux of the matter ＝ 核心。" },
  { type:"paraphrase", level:"C1", text:"Let me hedge against uncertainty.", q:"ほぼ同じ意味は？", choices:["Let me protect against the unknown.","Let me trim a hedge.","Let me be certain.","Let me ignore risk."], explain:"hedge against ＝ 〜に備える。" },
  { type:"intensive", level:"B2", text:"Never before had we faced this.", q:"この文の意味は？", choices:["これまで一度も直面したことがなかった。","よく直面した。","直面しなかった。","後で直面した。"], explain:"Never before + 倒置で強い否定。" },
  { type:"intensive", level:"C1", text:"So great was the effort that few could match it.", q:"この文の意味は？", choices:["努力が大きく、匹敵できる者は少なかった。","努力は小さかった。","誰でも匹敵できた。","努力は無かった。"], explain:"So + 形容詞 + 倒置で『非常に〜なので』。" },
  { type:"question", level:"B1", text:"次の手順を確認したい。", q:"最も適切な質問は？", choices:["What's the next step?","Why step always?","Can we ever proceed?","Is step hard?"], explain:"次の手順を尋ねる。" },
  { type:"question", level:"C1", text:"主張の限界を問いたい。", q:"最も適切な質問は？", choices:["Where does this argument break down?","Why argue ever?","Is it valid?","Can we skip it?"], explain:"主張が崩れる条件を問う。" },
  { type:"response", level:"B1", text:"A: Could you confirm the time?", q:"自然な応答は？", choices:["Sure, it's at three.","Yes time fast me.","Why time always?","Time is hard maybe."], explain:"依頼には Sure, it's at three. が自然。" },
  { type:"response", level:"C1", text:"A: Let's pressure-test this assumption.", q:"自然な応答は？", choices:["Good idea—what if it's false?","No, just trust it.","Why test?","You never decide."], explain:"前提の検証に同意し、偽の場合を問う。" },
  { type:"extensive", level:"B2", text:"The team posted its goals on the wall. Everyone could see priorities at a glance, fewer tasks slipped, and focus sharpened.", q:"内容に合うものは？", choices:["目標を壁に掲示し、優先が一目で分かり抜けが減り集中も増した。","掲示をやめた。","抜けが増えた。","集中が落ちた。"], explain:"目標掲示→優先可視化・抜け減・集中向上。" },
  { type:"extensive", level:"C1", text:"Criticized as unfocused, the company's many small bets meant that when one finally paid off, it more than covered all the others.", q:"内容に合うものは？", choices:["散漫と批判されたが、多くの小さな賭けの一つが当たり全てを補った。","賭けをやめた。","全て失敗した。","集中で成功した。"], explain:"多数の小さな賭け→一つの成功が全体を補填。" }
]);

/* 増量セットAR：高次スキル第23弾 仕上げ（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The clinic sent appointment reminders by text. Missed appointments dropped sharply, wait times shortened, and patients felt better cared for.", q:"最も適切な要約は？", choices:["予約リマインドで無断欠席が減り待ち時間も短縮した。","通知をやめた。","欠席が増えた。","待ち時間が延びた。"], explain:"リマインド→欠席減・待ち時間短縮。" },
  { type:"summary", level:"B2", text:"The store trained staff to say 'I'll find out' instead of guessing. Misinformation fell, trust rose, and complaints became rarer.", q:"最も適切な要約は？", choices:["推測せず『調べます』と言う訓練で誤情報が減り信頼が増した。","推測を奨励した。","誤情報が増えた。","信頼が落ちた。"], explain:"推測せず確認→誤情報減・信頼向上。" },
  { type:"summary", level:"C1", text:"By treating complaints as free research, the company mined them for patterns, fixing root causes that quietly improved the whole product.", q:"最も適切な要約は？", choices:["苦情を無料の調査と捉え、根本原因を直し製品全体を改善した。","苦情を無視した。","原因は残った。","製品が悪化した。"], explain:"苦情を調査と捉える→根本改善。" },
  { type:"paraphrase", level:"B1", text:"Coming right up.", q:"ほぼ同じ意味は？", choices:["It'll be ready soon.","Come upstairs.","It's going up.","Come quickly now."], explain:"Coming right up. ＝ すぐお持ちします。" },
  { type:"paraphrase", level:"B2", text:"Let's nip it in the bud.", q:"ほぼ同じ意味は？", choices:["Let's stop it early.","Let's pick a flower.","Let's let it grow.","Let's bite it."], explain:"nip in the bud ＝ 早めに摘み取る。" },
  { type:"paraphrase", level:"C1", text:"Let's bake in uncertainty.", q:"ほぼ同じ意味は？", choices:["Let's build the unknown into our plan.","Let's bake a cake.","Let's remove risk.","Let's be certain."], explain:"bake in ＝ 織り込む。" },
  { type:"intensive", level:"B2", text:"Not once did he complain.", q:"この文の意味は？", choices:["彼は一度も不平を言わなかった。","よく不平を言った。","一度だけ言った。","後で言った。"], explain:"Not once + 倒置で強い否定。" },
  { type:"intensive", level:"C1", text:"Only after testing did we trust it.", q:"この文の意味は？", choices:["検証して初めて信頼した。","検証前に信頼した。","信頼しなかった。","すぐ信頼した。"], explain:"Only after … + 倒置で『〜して初めて』。" },
  { type:"question", level:"B1", text:"理解を確かめたい。", q:"最も適切な質問は？", choices:["Does that all make sense?","Why confused?","Can you follow ever?","Is it sense?"], explain:"Does that all make sense? で理解確認。" },
  { type:"question", level:"C1", text:"主張の前提を問いたい。", q:"最も適切な質問は？", choices:["What has to be true for this to hold?","Why true ever?","Is it real?","Can we skip?"], explain:"主張が成立する前提を問う。" },
  { type:"response", level:"B1", text:"A: Could you wrap this up?", q:"自然な応答は？", choices:["Sure, I'll finish it now.","Yes wrap fast me.","Why wrap always?","Wrap is hard."], explain:"依頼には Sure, I'll finish it now. が自然。" },
  { type:"response", level:"C1", text:"A: Let's separate facts from opinions.", q:"自然な応答は？", choices:["Agreed—let's label which is which.","No, mix them.","Why bother?","You never decide."], explain:"事実と意見の分離に同意。" },
  { type:"extensive", level:"B2", text:"The school taught note-taking explicitly. Students retained more, study time fell, and grades rose across subjects.", q:"内容に合うものは？", choices:["ノート術を明示的に教え、定着・効率・成績が向上した。","ノートをやめた。","定着が落ちた。","成績が下がった。"], explain:"ノート術指導→定着・効率・成績向上。" },
  { type:"extensive", level:"C1", text:"Dismissed as a niche hobby, the format's small but devoted community kept refining it until mainstream users finally took notice.", q:"内容に合うものは？", choices:["ニッチと退けられたが、熱心な少数が磨き続け主流の注目を得た。","すぐ消えた。","主流が無視し続けた。","誰も磨かなかった。"], explain:"熱心な少数→磨き続け主流の注目。" }
]);

/* 増量セットAT：高次スキル第24弾 最終仕上げ（5倍ペース完全維持） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The team wrote down decisions in a shared doc. Fewer things were forgotten, new members caught up faster, and debates rarely repeated.", q:"最も適切な要約は？", choices:["決定を共有文書に記録し、忘れ減・立ち上がり加速・蒸し返し防止を得た。","記録をやめた。","忘れが増えた。","議論が繰り返された。"], explain:"決定記録→忘れ減・加速・蒸し返し防止。" },
  { type:"paraphrase", level:"B2", text:"That misses the point.", q:"ほぼ同じ意味は？", choices:["That overlooks the key issue.","That hits the target.","That's exactly right.","That loses the ball."], explain:"miss the point ＝ 要点を外す。" },
  { type:"intensive", level:"C1", text:"Hardly ever does it fail.", q:"この文の意味は？", choices:["それはめったに失敗しない。","よく失敗する。","必ず失敗する。","一度失敗した。"], explain:"Hardly ever + 倒置で『めったに〜ない』。" },
  { type:"question", level:"B2", text:"判断の前提を引き出したい。", q:"最も適切な質問は？", choices:["What are we taking for granted here?","Why assume always?","Is it real?","Can we skip it?"], explain:"当然視している前提を問う。" },
  { type:"response", level:"C1", text:"A: Let's validate before we scale.", q:"自然な応答は？", choices:["Agreed—let's prove it small first.","No, scale now.","Why validate?","You never decide."], explain:"検証優先に同意し小規模実証を提案。" },
  { type:"extensive", level:"B2", text:"The cafe asked regulars what to add to the menu. New items sold well, regulars felt heard, and waste from guesswork dropped.", q:"内容に合うものは？", choices:["常連に追加品を尋ね、よく売れ声も反映し廃棄も減った。","尋ねるのをやめた。","売れ残った。","廃棄が増えた。"], explain:"常連に相談→売上・反映・廃棄減。" },
  { type:"summary", level:"C1", text:"By rewarding teams for catching their own errors, the firm turned hidden mistakes into openly shared lessons that prevented repeat failures.", q:"最も適切な要約は？", choices:["自らの誤り発見を評価し、隠れたミスを共有教訓に変え再発を防いだ。","誤りを罰した。","ミスが隠れた。","再発が増えた。"], explain:"自己発見を評価→共有教訓→再発防止。" },
  { type:"paraphrase", level:"C1", text:"Let's take the long view.", q:"ほぼ同じ意味は？", choices:["Let's think about the long term.","Let's look far away.","Let's be shortsighted.","Let's take a photo."], explain:"take the long view ＝ 長期的に考える。" }
]);

/* 増量セットAU：高次スキル第25弾 大量（5倍ペース完全維持） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The store extended its return window to 90 days. Shoppers felt less pressure, impulse returns dropped, and customer trust grew noticeably.", q:"最も適切な要約は？", choices:["返品期間延長で安心感が増し、衝動返品が減り信頼が高まった。","返品を禁止した。","返品が急増した。","信頼が下がった。"], explain:"返品期間延長→安心・返品減・信頼向上。" },
  { type:"summary", level:"B1", text:"The library added cozy reading nooks. Visits increased, people stayed longer, and the space became a community hub.", q:"最も適切な要約は？", choices:["読書スペース追加で来館・滞在が増え地域の拠点になった。","席を撤去した。","来館が減った。","利用が落ちた。"], explain:"読書スペース→来館・滞在増・拠点化。" },
  { type:"summary", level:"B2", text:"The company replaced annual reviews with weekly check-ins. Feedback became timely, problems surfaced earlier, and morale improved markedly.", q:"最も適切な要約は？", choices:["年次評価を週次面談に変え、迅速な意見と早期発見で士気が向上した。","評価を廃止した。","意見が遅くなった。","士気が下がった。"], explain:"週次面談→迅速な意見・早期発見・士気向上。" },
  { type:"summary", level:"B2", text:"The school introduced peer tutoring. Struggling students caught up, tutors deepened their own understanding, and a culture of mutual help took root.", q:"最も適切な要約は？", choices:["ピア指導で遅れた生徒が追いつき、指導側も理解を深め相互扶助が根付いた。","指導をやめた。","理解が浅まった。","孤立が進んだ。"], explain:"ピア指導→追いつき・理解深化・相互扶助。" },
  { type:"summary", level:"C1", text:"By publishing its failures alongside its successes, the lab built a reputation for honesty that attracted both funding and top researchers.", q:"最も適切な要約は？", choices:["失敗も成功と共に公開し、誠実さの評判で資金と人材を集めた。","失敗を隠した。","評判が落ちた。","人材が離れた。"], explain:"失敗の公開→誠実さの評判→資金・人材獲得。" },
  { type:"paraphrase", level:"B1", text:"That's news to me.", q:"ほぼ同じ意味は？", choices:["I didn't know that.","That's on TV.","I knew that already.","That's a newspaper."], explain:"news to me ＝ 初耳だ。" },
  { type:"paraphrase", level:"B1", text:"Let's take it step by step.", q:"ほぼ同じ意味は？", choices:["Let's do it gradually.","Let's run fast.","Let's skip steps.","Let's climb stairs."], explain:"step by step ＝ 順を追って。" },
  { type:"paraphrase", level:"B2", text:"Let's get on the same page.", q:"ほぼ同じ意味は？", choices:["Let's reach a shared understanding.","Let's read a book.","Let's turn the page.","Let's disagree."], explain:"on the same page ＝ 認識を合わせる。" },
  { type:"paraphrase", level:"B2", text:"There's room for improvement.", q:"ほぼ同じ意味は？", choices:["It could be better.","There's an empty room.","It's perfect already.","There's no space."], explain:"room for improvement ＝ 改善の余地。" },
  { type:"paraphrase", level:"C1", text:"Let's account for the uncertainty.", q:"ほぼ同じ意味は？", choices:["Let's factor in the unknowns.","Let's count the money.","Let's ignore the risk.","Let's be certain."], explain:"account for ＝ 考慮に入れる。" },
  { type:"intensive", level:"B2", text:"Seldom have I seen such effort.", q:"この文の意味は？", choices:["これほどの努力はめったに見ない。","よく見る。","努力は無かった。","一度見た。"], explain:"Seldom + 倒置で『めったに〜ない』。" },
  { type:"intensive", level:"B2", text:"Not until later did it click.", q:"この文の意味は？", choices:["後になって初めて腑に落ちた。","すぐ分かった。","分からなかった。","早く分かった。"], explain:"Not until + 倒置で『〜して初めて』。" },
  { type:"intensive", level:"C1", text:"Had they known, they would have acted.", q:"この文の意味は？", choices:["知っていたら行動していた。","知っていて行動した。","知らずに行動した。","行動しなかった理由は不明。"], explain:"Had + 主語 で仮定法過去完了の倒置。" },
  { type:"intensive", level:"B2", text:"All things considered, it went well.", q:"All things considered の意味は？", choices:["すべてを考慮すると","急いで言うと","めったにないが","結論を避けて"], explain:"All things considered ＝ すべてを考慮すると。" },
  { type:"question", level:"B1", text:"相手の都合を尋ねたい。", q:"最も適切な質問は？", choices:["Does this time work for you?","Why busy always?","Can you ever meet?","Is time hard?"], explain:"Does this time work for you? で都合を確認。" },
  { type:"question", level:"B2", text:"提案の根拠を引き出したい。", q:"最も適切な質問は？", choices:["What's the reasoning behind this?","Why reason ever?","Is it real?","Can we skip it?"], explain:"提案の論拠を問う。" },
  { type:"question", level:"C1", text:"主張が成り立つ条件を問いたい。", q:"最も適切な質問は？", choices:["Under what conditions does this hold?","Why hold ever?","Is it true now?","Can we ignore it?"], explain:"成立条件を問い議論を厳密にする。" },
  { type:"response", level:"B1", text:"A: Could you double-check this?", q:"自然な応答は？", choices:["Sure, I'll go over it.","Yes check fast me.","Why check always?","Check is hard maybe."], explain:"依頼には Sure, I'll go over it. が自然。" },
  { type:"response", level:"B2", text:"A: I'm not sure this is the right call.", q:"建設的な応答は？", choices:["Let's weigh the alternatives.","Then give up.","Why doubt?","Not my problem."], explain:"迷いに対し代替案の比較を提案。" },
  { type:"response", level:"C1", text:"A: Let's ground this in data.", q:"自然な応答は？", choices:["Agreed—what does the evidence show?","No, trust your gut.","Why data?","You never decide."], explain:"データ重視に同意し証拠を尋ねる。" },
  { type:"extensive", level:"B1", text:"Ken was nervous about speaking English. He joined a daily 10-minute call with a partner. In two months, his confidence soared.", q:"内容に合うものは？", choices:["毎日10分の通話を続け、2か月で自信が大きく伸びた。","英語をやめた。","変化は無かった。","通話は続かなかった。"], explain:"毎日10分→2か月で自信向上。" },
  { type:"extensive", level:"B2", text:"The cafe let customers pay what they could for day-old pastries. Waste dropped sharply, goodwill spread, and regulars increased.", q:"内容に合うものは？", choices:["前日のパンを応分の支払いにし、廃棄減・好意・常連増を生んだ。","廃棄を増やした。","客が減った。","好意が薄れた。"], explain:"応分払い→廃棄減・好意・常連増。" },
  { type:"extensive", level:"C1", text:"Dismissed as too cautious, the engineer's insistence on extra testing caught a flaw that would have caused a costly recall.", q:"内容に合うものは？", choices:["慎重すぎと退けられたが、追加検査が高くつくリコールを防いだ。","検査をやめた。","欠陥が残った。","慎重さが裏目に出た。"], explain:"追加検査→重大な欠陥を発見しリコール回避。" }
]);

/* 増量セットAW：高次スキル第26弾（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The team started ending meetings five minutes early. People had time to reset, transitions felt smoother, and attendance improved.", q:"最も適切な要約は？", choices:["会議を5分早く終え、切り替えが楽になり出席も増えた。","会議を延長した。","切り替えが悪化した。","出席が減った。"], explain:"早め終了→切り替え改善・出席増。" },
  { type:"summary", level:"B2", text:"The shop trained staff to greet every customer by name when possible. Loyalty rose, complaints fell, and word of mouth spread.", q:"最も適切な要約は？", choices:["名前で挨拶する訓練で、愛顧が増え苦情が減り口コミが広がった。","挨拶をやめた。","愛顧が落ちた。","苦情が増えた。"], explain:"名前で挨拶→愛顧・口コミ増・苦情減。" },
  { type:"summary", level:"C1", text:"By open-sourcing its core tool, the firm sacrificed short-term revenue but gained a vast contributor community that accelerated its growth.", q:"最も適切な要約は？", choices:["中核ツールを公開し短期収益を犠牲にしたが、貢献者の community が成長を加速した。","公開をやめた。","成長が止まった。","収益だけ増えた。"], explain:"OSS化→短期収益犠牲も貢献者で成長加速。" },
  { type:"paraphrase", level:"B1", text:"I'm all set.", q:"ほぼ同じ意味は？", choices:["I'm ready.","I'm seated.","I'm leaving.","I'm tired."], explain:"all set ＝ 準備完了。" },
  { type:"paraphrase", level:"B2", text:"Let's work back from the deadline.", q:"ほぼ同じ意味は？", choices:["Let's plan in reverse from the due date.","Let's go back to work.","Let's miss the deadline.","Let's walk backward."], explain:"work back from ＝ 逆算する。" },
  { type:"paraphrase", level:"C1", text:"Let's spot the one-way doors.", q:"ほぼ同じ意味は？", choices:["Let's identify the irreversible decisions.","Let's find the exits.","Let's open every door.","Let's lock the doors."], explain:"one-way doors ＝ 不可逆な決定。" },
  { type:"intensive", level:"B2", text:"No sooner had we left than it rained.", q:"この文の意味は？", choices:["出たとたんに雨が降った。","出る前に降った。","降らなかった。","ゆっくり降った。"], explain:"No sooner … than ～で『〜するやいなや』。" },
  { type:"intensive", level:"C1", text:"Scarcely had it begun when it stopped.", q:"この文の意味は？", choices:["始まったかと思うと止まった。","始まらなかった。","長く続いた。","止まらなかった。"], explain:"Scarcely … when ～で『〜するやいなや』。" },
  { type:"question", level:"B1", text:"確認の念押しをしたい。", q:"最も適切な質問は？", choices:["Just to confirm, is that right?","Why confirm always?","Can it be wrong?","Is right hard?"], explain:"Just to confirm で念押し確認。" },
  { type:"question", level:"C1", text:"主張の例外を問いたい。", q:"最も適切な質問は？", choices:["Are there cases where this doesn't hold?","Why hold ever?","Is it always?","Can we skip?"], explain:"例外の有無を問い精度を上げる。" },
  { type:"response", level:"B1", text:"A: Could you take this on?", q:"自然な応答は？", choices:["Sure, I can handle it.","Yes take fast me.","Why take always?","Take is hard."], explain:"依頼には Sure, I can handle it. が自然。" },
  { type:"response", level:"C1", text:"A: Let's quantify the benefit first.", q:"自然な応答は？", choices:["Good—what metric should we use?","No, just guess.","Why measure?","You never decide."], explain:"定量化に同意し指標を尋ねる。" },
  { type:"extensive", level:"B2", text:"The office set 'no-email Fridays.' Deep work increased, weekend stress dropped, and important tasks moved faster.", q:"内容に合うものは？", choices:["メールなし金曜で集中が増え、週末ストレス減・重要業務が加速した。","メールを増やした。","集中が減った。","ストレスが増えた。"], explain:"メールなし日→集中増・ストレス減・加速。" },
  { type:"extensive", level:"C1", text:"Mocked for over-preparing, the speaker's many rehearsals let her handle a technical failure so smoothly the audience never noticed.", q:"内容に合うものは？", choices:["準備しすぎと笑われたが、入念なリハで機材トラブルを気づかれず乗り切った。","準備をやめた。","失敗が露呈した。","準備が裏目に出た。"], explain:"入念なリハ→トラブルを気づかれず処理。" }
]);

/* 増量セットAX：高次スキル第27弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The gym added beginner-only hours. Newcomers felt less intimidated, sign-ups rose, and many became long-term members.", q:"最も適切な要約は？", choices:["初心者専用時間で気後れが減り、入会と定着が増えた。","時間を廃止した。","入会が減った。","定着が落ちた。"], explain:"初心者専用→気後れ減・入会・定着増。" },
  { type:"summary", level:"B1", text:"The restaurant printed allergens on every menu. Diners felt safer, ordering got faster, and staff answered fewer questions.", q:"最も適切な要約は？", choices:["アレルゲン表示で安心が増し、注文が速まり質問が減った。","表示をやめた。","注文が遅くなった。","質問が増えた。"], explain:"アレルゲン表示→安心・注文速化・質問減。" },
  { type:"summary", level:"B2", text:"The team began writing one-page decision memos. Choices became clearer, debates shortened, and past decisions were easy to revisit.", q:"最も適切な要約は？", choices:["1枚の決定メモで選択が明確化し、議論が短縮され見直しも容易になった。","メモを廃止した。","議論が長引いた。","見直しが困難になった。"], explain:"決定メモ→明確化・議論短縮・見直し容易。" },
  { type:"summary", level:"C1", text:"By rotating staff through customer support, the firm ensured every employee understood user pain firsthand, which sharpened the whole product.", q:"最も適切な要約は？", choices:["全社員を顧客対応に回し、ユーザーの痛みを直接理解させ製品を磨いた。","対応を外注した。","理解が浅まった。","製品が悪化した。"], explain:"全社員が顧客対応→痛みの理解→製品改善。" },
  { type:"paraphrase", level:"B1", text:"Could you be more specific?", q:"ほぼ同じ意味は？", choices:["Could you give more detail?","Could you be louder?","Could you be vague?","Could you be quick?"], explain:"more specific ＝ より具体的に。" },
  { type:"paraphrase", level:"B2", text:"That's blocking success.", q:"ほぼ同じ意味は？", choices:["That's getting in the way of success.","That's a building.","That's helping us win.","That's a road."], explain:"blocking ＝ 妨げている。" },
  { type:"paraphrase", level:"C1", text:"Which assumption is weakest?", q:"ほぼ同じ意味は？", choices:["Which premise is least reliable?","Which muscle is weak?","Which is strongest?","Which is heaviest?"], explain:"weakest assumption ＝ 最も脆い前提。" },
  { type:"intensive", level:"B2", text:"Such was his skill that none could rival it.", q:"この文の意味は？", choices:["彼の技は誰も並べないほどだった。","技は平凡だった。","誰でも並べた。","技は無かった。"], explain:"Such was … that ～で『非常に〜なので』。" },
  { type:"intensive", level:"C1", text:"Only by testing can we be sure.", q:"この文の意味は？", choices:["検証して初めて確信できる。","検証せず確信できる。","確信できない。","すぐ確信できる。"], explain:"Only by … + 倒置で『〜して初めて』。" },
  { type:"question", level:"B1", text:"次の行動を促したい。", q:"最も適切な質問は？", choices:["What should we do next?","Why next always?","Can we ever act?","Is next hard?"], explain:"What should we do next? で次の行動を促す。" },
  { type:"question", level:"C1", text:"見落としを洗い出したい。", q:"最も適切な質問は？", choices:["What are we overlooking here?","Why overlook ever?","Is it complete?","Can we skip?"], explain:"見落としを問い網羅性を高める。" },
  { type:"response", level:"B1", text:"A: Could you walk me through it?", q:"自然な応答は？", choices:["Sure, let me explain step by step.","Yes walk fast me.","Why walk always?","Walk is hard."], explain:"依頼には Sure, let me explain … が自然。" },
  { type:"response", level:"C1", text:"A: Let's stress-test this plan.", q:"自然な応答は？", choices:["Good idea—where could it break?","No, just launch.","Why test?","You never decide."], explain:"plan の検証に同意し弱点を問う。" },
  { type:"extensive", level:"B2", text:"The library opened a tool-lending shelf. Neighbors borrowed instead of buying, saved money, and met new people in the process.", q:"内容に合うものは？", choices:["工具貸出で住民が購入せず借り、節約しつつ交流も生まれた。","貸出をやめた。","購入が増えた。","交流が減った。"], explain:"工具貸出→節約・交流。" },
  { type:"extensive", level:"C1", text:"Criticized for moving slowly, the regulator's careful review prevented a rushed approval that later proved disastrous elsewhere.", q:"内容に合うものは？", choices:["遅いと批判されたが、慎重な審査が他所で災いを招いた拙速な承認を防いだ。","審査をやめた。","拙速に承認した。","慎重さが裏目に出た。"], explain:"慎重な審査→拙速な承認を回避。" }
]);

/* 増量セットAZ：高次スキル第28弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The museum offered free entry on Fridays. Attendance soared, new visitors discovered exhibits, and membership sign-ups followed.", q:"最も適切な要約は？", choices:["金曜無料で来館が急増し、新来館者が展示を知り会員も増えた。","無料をやめた。","来館が減った。","会員が減った。"], explain:"金曜無料→来館・会員増。" },
  { type:"summary", level:"B2", text:"The startup shared its roadmap publicly. Users felt involved, feedback improved the plan, and trust in the brand deepened.", q:"最も適切な要約は？", choices:["ロードマップ公開で参加感が生まれ、意見が計画を改善し信頼が深まった。","公開をやめた。","参加感が減った。","信頼が落ちた。"], explain:"公開→参加感・改善・信頼。" },
  { type:"summary", level:"C1", text:"By admitting uncertainty in its forecasts, the agency built credibility that, paradoxically, made people trust its confident predictions more.", q:"最も適切な要約は？", choices:["予測の不確実性を認めて信頼を築き、逆に自信ある予測も信じられた。","不確実性を隠した。","信頼が落ちた。","予測をやめた。"], explain:"不確実性を認める→信頼構築→自信ある予測も信頼。" },
  { type:"paraphrase", level:"B1", text:"Either is fine.", q:"ほぼ同じ意味は？", choices:["I don't mind which one.","Both are bad.","Neither works.","Only one is fine."], explain:"Either is fine ＝ どちらでもいい。" },
  { type:"paraphrase", level:"B2", text:"Let's stick to the key points.", q:"ほぼ同じ意味は？", choices:["Let's focus on what matters.","Let's use glue.","Let's add details.","Let's wander off."], explain:"stick to ＝ 〜に絞る。" },
  { type:"paraphrase", level:"C1", text:"Let's question the premise.", q:"ほぼ同じ意味は？", choices:["Let's challenge the underlying assumption.","Let's ask a question.","Let's accept it fully.","Let's skip it."], explain:"question the premise ＝ 前提を問い直す。" },
  { type:"intensive", level:"B2", text:"Rarely is the answer so simple.", q:"この文の意味は？", choices:["答えがこれほど単純なことはめったにない。","答えは単純だ。","答えは無い。","答えは難しい。"], explain:"Rarely + 倒置で『めったに〜ない』。" },
  { type:"intensive", level:"C1", text:"Were it true, everything would change.", q:"この文の意味は？", choices:["もしそれが本当なら、すべてが変わる。","本当だから変わった。","本当ではない。","何も変わらない。"], explain:"Were it true で仮定法の倒置。" },
  { type:"question", level:"B1", text:"理解度を確かめたい。", q:"最も適切な質問は？", choices:["Is that clear so far?","Why clear always?","Can you follow ever?","Is clear hard?"], explain:"Is that clear so far? で理解確認。" },
  { type:"question", level:"C1", text:"判断のバイアスを問いたい。", q:"最も適切な質問は？", choices:["Could bias be influencing this?","Why bias ever?","Is it neutral?","Can we skip?"], explain:"バイアスの影響を問い客観性を保つ。" },
  { type:"response", level:"B1", text:"A: Could you summarize the meeting?", q:"自然な応答は？", choices:["Sure, here are the highlights.","Yes sum fast me.","Why summary always?","Sum is hard."], explain:"依頼には Sure, here are the highlights. が自然。" },
  { type:"response", level:"C1", text:"A: Let's separate symptoms from causes.", q:"自然な応答は？", choices:["Agreed—what's the underlying cause?","No, treat symptoms.","Why bother?","You never decide."], explain:"症状と原因の分離に同意。" },
  { type:"extensive", level:"B2", text:"The office created a 'question of the week' board. Curiosity spread, quiet staff contributed, and cross-team learning grew.", q:"内容に合うものは？", choices:["週の問いの掲示で好奇心が広がり、無口な社員も参加し横断学習が増えた。","掲示をやめた。","好奇心が減った。","学習が落ちた。"], explain:"週の問い→好奇心・参加・横断学習。" },
  { type:"extensive", level:"C1", text:"Faulted for spending on documentation, the team found that clear records let new hires contribute in days rather than weeks.", q:"内容に合うものは？", choices:["文書化への投資を責められたが、明確な記録で新人が数日で戦力化した。","文書化をやめた。","戦力化が遅れた。","投資が無駄だった。"], explain:"明確な記録→新人が早期に戦力化。" }
]);

/* 増量セットBB：高次スキル第29弾 仕上げ（5倍ペース完全維持） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The cafe added a community board for local events. Regulars connected, foot traffic rose, and the cafe became a neighborhood hub.", q:"最も適切な要約は？", choices:["地域掲示板で常連がつながり、来客が増え地域の拠点になった。","掲示板を撤去した。","来客が減った。","つながりが薄れた。"], explain:"地域掲示板→つながり・来客増・拠点化。" },
  { type:"summary", level:"B2", text:"The team logged every recurring problem in one place. Patterns emerged, root causes got fixed, and the same issues stopped returning.", q:"最も適切な要約は？", choices:["再発問題を一元記録し、パターンから根本を直し再発が止まった。","記録をやめた。","再発が増えた。","原因が残った。"], explain:"一元記録→パターン把握・根本修正・再発防止。" },
  { type:"summary", level:"C1", text:"By rewarding employees for flagging their own mistakes early, the firm caught small errors before they compounded into costly failures.", q:"最も適切な要約は？", choices:["早期のミス申告を評価し、小さな誤りが大失敗に膨らむ前に対処した。","ミスを罰した。","誤りが膨らんだ。","失敗が増えた。"], explain:"早期申告を評価→小さな誤りを早期対処。" },
  { type:"paraphrase", level:"B1", text:"Let's take stock.", q:"ほぼ同じ意味は？", choices:["Let's review where we are.","Let's buy shares.","Let's ignore status.","Let's store goods."], explain:"take stock ＝ 状況を見直す。" },
  { type:"paraphrase", level:"B2", text:"Let's build in a review.", q:"ほぼ同じ意味は？", choices:["Let's schedule a check-in.","Let's build a house.","Let's skip checking.","Let's read a review."], explain:"build in ＝ 組み込む。" },
  { type:"paraphrase", level:"C1", text:"Let's separate symptoms from causes.", q:"ほぼ同じ意味は？", choices:["Let's tell effects apart from their sources.","Let's treat the symptoms.","Let's combine them.","Let's ignore causes."], explain:"症状と原因を区別する。" },
  { type:"intensive", level:"B2", text:"Not only did it work, it thrived.", q:"この文の意味は？", choices:["うまくいっただけでなく、繁栄した。","失敗した。","変化は無かった。","衰えた。"], explain:"Not only + 倒置で『〜だけでなく』。" },
  { type:"intensive", level:"C1", text:"So subtle was the change that few noticed.", q:"この文の意味は？", choices:["変化が微妙で気づく人は少なかった。","変化は大きかった。","誰も変えなかった。","皆気づいた。"], explain:"So + 形容詞 + 倒置で『非常に〜なので』。" },
  { type:"question", level:"B1", text:"次の予定を確認したい。", q:"最も適切な質問は？", choices:["What's on the agenda next?","Why next always?","Can we ever plan?","Is next hard?"], explain:"What's on the agenda next? で次を確認。" },
  { type:"question", level:"C1", text:"見解の根拠の強さを問いたい。", q:"最も適切な質問は？", choices:["How confident are we in this?","Why confident ever?","Is it sure?","Can we skip?"], explain:"確信度を問い不確実性を明示する。" },
  { type:"response", level:"B1", text:"A: Could you keep me posted?", q:"自然な応答は？", choices:["Of course, I'll update you.","Yes post fast me.","Why update always?","Post is hard."], explain:"依頼には Of course, I'll update you. が自然。" },
  { type:"response", level:"C1", text:"A: Let's define done before we start.", q:"自然な応答は？", choices:["Smart—what does done look like?","No, just start.","Why define?","You never decide."], explain:"完了の定義に同意し具体像を問う。" },
  { type:"extensive", level:"B2", text:"The shop let customers name a new flavor. Engagement soared, the winning name drove sales, and customers felt real ownership.", q:"内容に合うものは？", choices:["新味の命名を客に委ね、関与が高まり売上と当事者意識が増した。","命名をやめた。","関与が減った。","売上が落ちた。"], explain:"命名を委ねる→関与・売上・当事者意識。" },
  { type:"extensive", level:"C1", text:"Dismissed as needless ceremony, the team's short daily check-ins surfaced blockers early and kept everyone moving in the same direction.", q:"内容に合うものは？", choices:["無駄な儀式と退けられたが、短い日次確認が障害を早期発見し足並みをそろえた。","確認をやめた。","障害が残った。","足並みが乱れた。"], explain:"日次確認→障害の早期発見・足並み統一。" }
]);

/* 増量セットBD：高次スキル第30弾 最終（5倍ペース完全達成） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The team posted a weekly win on the wall. Morale lifted, people noticed progress, and motivation carried into the next week.", q:"最も適切な要約は？", choices:["週の成果を掲示し、士気が上がり進捗を実感し意欲が続いた。","掲示をやめた。","士気が下がった。","意欲が落ちた。"], explain:"週の成果掲示→士気・実感・意欲。" },
  { type:"paraphrase", level:"B2", text:"Let's make it concrete.", q:"ほぼ同じ意味は？", choices:["Let's make it specific.","Let's pour cement.","Let's keep it vague.","Let's make it soft."], explain:"concrete ＝ 具体的な。" },
  { type:"intensive", level:"C1", text:"Little did they realize the impact.", q:"この文の意味は？", choices:["彼らはその影響にほとんど気づいていなかった。","よく気づいていた。","影響は無かった。","すぐ気づいた。"], explain:"Little did … で『ほとんど〜なかった』。" },
  { type:"question", level:"B2", text:"判断の前提条件を引き出したい。", q:"最も適切な質問は？", choices:["What needs to be true for this to work?","Why true always?","Is it real?","Can we skip?"], explain:"成立に必要な前提を問う。" },
  { type:"response", level:"C1", text:"A: Let's pilot before a full rollout.", q:"自然な応答は？", choices:["Agreed—let's test on a small group.","No, launch fully.","Why pilot?","You never decide."], explain:"試験運用に同意し小規模検証を提案。" },
  { type:"extensive", level:"B2", text:"The library extended evening hours. Working people could finally visit, study groups formed, and usage climbed steadily.", q:"内容に合うものは？", choices:["夜間延長で働く人が利用でき、勉強会ができ利用が着実に増えた。","時間を短縮した。","利用が減った。","勉強会が消えた。"], explain:"夜間延長→利用拡大・勉強会・増加。" },
  { type:"summary", level:"C1", text:"By measuring what mattered rather than what was easy to count, the team finally aligned its metrics with its true goals.", q:"最も適切な要約は？", choices:["数えやすさでなく重要性で測り、指標を真の目標に合わせた。","測定をやめた。","目標とずれた。","指標が悪化した。"], explain:"重要性で測る→指標と目標の一致。" }
]);

/* 増量セットBE：高次スキル第31弾 大量（5倍ペース完全維持） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The company let staff choose their own hours. Productivity rose, sick days dropped, and people reported feeling more trusted.", q:"最も適切な要約は？", choices:["勤務時間の自由化で生産性が上がり、欠勤が減り信頼感も高まった。","時間を固定した。","生産性が落ちた。","欠勤が増えた。"], explain:"自由化→生産性・信頼向上・欠勤減。" },
  { type:"summary", level:"B1", text:"The store placed a suggestion box by the door. Customers shared ideas, several were adopted, and loyalty grew.", q:"最も適切な要約は？", choices:["提案箱で客の意見が集まり、採用され、愛顧が高まった。","箱を撤去した。","意見が減った。","愛顧が落ちた。"], explain:"提案箱→意見・採用・愛顧。" },
  { type:"summary", level:"B2", text:"The team adopted a 'no meeting Wednesday' rule. Focus time doubled, deep work flourished, and weekly output noticeably improved.", q:"最も適切な要約は？", choices:["会議なし水曜で集中時間が倍増し、深い仕事が増え週の成果が向上した。","会議を増やした。","集中が減った。","成果が落ちた。"], explain:"会議なし日→集中倍増・成果向上。" },
  { type:"summary", level:"B2", text:"The school replaced grades with detailed written feedback. Students focused on learning, anxiety fell, and curiosity returned.", q:"最も適切な要約は？", choices:["成績を詳細な記述評価に替え、学びに集中し不安が減り好奇心が戻った。","評価を廃止した。","不安が増えた。","好奇心が消えた。"], explain:"記述評価→学びへの集中・不安減・好奇心。" },
  { type:"summary", level:"C1", text:"By publishing its decision-making process openly, the city built trust that survived even unpopular choices, because residents understood the reasoning.", q:"最も適切な要約は？", choices:["意思決定過程を公開し、住民が理由を理解したため不人気な選択でも信頼が保たれた。","過程を隠した。","信頼が崩れた。","住民が反発した。"], explain:"過程の公開→理由の理解→信頼の維持。" },
  { type:"paraphrase", level:"B1", text:"That slipped my mind.", q:"ほぼ同じ意味は？", choices:["I forgot it.","I lost it.","I remembered it.","I found it."], explain:"slip one's mind ＝ 忘れる。" },
  { type:"paraphrase", level:"B1", text:"Let me run that by you.", q:"ほぼ同じ意味は？", choices:["Let me check it with you.","Let me run away.","Let me ignore you.","Let me race you."], explain:"run by ＝ 確認のため伝える。" },
  { type:"paraphrase", level:"B2", text:"Let's take stock.", q:"ほぼ同じ意味は？", choices:["Let's assess the situation.","Let's buy shares.","Let's ignore it.","Let's store goods."], explain:"take stock ＝ 状況を見直す。" },
  { type:"paraphrase", level:"B2", text:"That's a deal-breaker.", q:"ほぼ同じ意味は？", choices:["That makes the deal impossible.","That seals the deal.","That's a great deal.","That's a small issue."], explain:"deal-breaker ＝ 決裂の元。" },
  { type:"paraphrase", level:"C1", text:"Let's not jump to conclusions.", q:"ほぼ同じ意味は？", choices:["Let's not decide too quickly.","Let's jump higher.","Let's conclude now.","Let's skip the end."], explain:"jump to conclusions ＝ 早合点する。" },
  { type:"intensive", level:"B2", text:"Hardly had I arrived when it began.", q:"この文の意味は？", choices:["到着するやいなや始まった。","到着前に始まった。","始まらなかった。","ゆっくり始まった。"], explain:"Hardly … when ～で『〜するやいなや』。" },
  { type:"intensive", level:"B2", text:"Not for a moment did I doubt it.", q:"この文の意味は？", choices:["一瞬たりとも疑わなかった。","ずっと疑った。","少し疑った。","信じなかった。"], explain:"Not for a moment + 倒置で強い否定。" },
  { type:"intensive", level:"C1", text:"Such is life that plans often change.", q:"この文の意味は？", choices:["人生とはそういうもので、計画はよく変わる。","計画は変わらない。","人生は単純だ。","計画通りに進む。"], explain:"Such is … that ～の構文。" },
  { type:"intensive", level:"B2", text:"By and large, the plan worked.", q:"By and large の意味は？", choices:["全体的に見て","急いで言うと","めったにないが","結論を避けて"], explain:"By and large ＝ 概して。" },
  { type:"question", level:"B1", text:"相手の意向を確かめたい。", q:"最も適切な質問は？", choices:["What would you prefer?","Why prefer always?","Can you ever choose?","Is choice hard?"], explain:"What would you prefer? で意向を確認。" },
  { type:"question", level:"B2", text:"成功の定義を引き出したい。", q:"最も適切な質問は？", choices:["What does success look like here?","Why succeed ever?","Is it done?","Can we skip?"], explain:"成功の定義を問い目標を明確化。" },
  { type:"question", level:"C1", text:"判断の見落としを探りたい。", q:"最も適切な質問は？", choices:["What might we be missing?","Why miss ever?","Is it complete?","Can we ignore it?"], explain:"見落としを問い網羅性を高める。" },
  { type:"response", level:"B1", text:"A: Could you send me the file?", q:"自然な応答は？", choices:["Sure, I'll send it now.","Yes send fast me.","Why send always?","Send is hard."], explain:"依頼には Sure, I'll send it now. が自然。" },
  { type:"response", level:"B2", text:"A: I'm not sure this will work.", q:"建設的な応答は？", choices:["Let's test it on a small scale first.","Then give up.","Why doubt?","Not my problem."], explain:"不安に対し小規模検証を提案。" },
  { type:"response", level:"C1", text:"A: Let's anchor this in evidence.", q:"自然な応答は？", choices:["Agreed—what does the data say?","No, trust your gut.","Why evidence?","You never decide."], explain:"証拠重視に同意しデータを尋ねる。" },
  { type:"extensive", level:"B1", text:"Mia feared math. Her teacher broke each problem into tiny steps. Slowly, her confidence grew, and she began to enjoy it.", q:"内容に合うものは？", choices:["問題を細かく分けた指導で、自信がつき数学を楽しみ始めた。","数学をやめた。","自信が消えた。","嫌いになった。"], explain:"細分化→自信・楽しさ。" },
  { type:"extensive", level:"B2", text:"The cafe trained baristas to remember regulars' orders. Customers felt valued, visits increased, and the cafe stood out from chains.", q:"内容に合うものは？", choices:["常連の注文を覚える訓練で、大切にされた感じが来店を増やし差別化した。","訓練をやめた。","来店が減った。","埋もれた。"], explain:"注文記憶→価値・来店増・差別化。" },
  { type:"extensive", level:"C1", text:"Ridiculed for over-documenting, the engineer's detailed notes let the team rebuild a lost system in days instead of months.", q:"内容に合うものは？", choices:["文書化しすぎと笑われたが、詳細な記録で失われたシステムを数日で再建できた。","記録をやめた。","再建が遅れた。","記録が無駄だった。"], explain:"詳細な記録→失われたシステムを迅速に再建。" }
]);

/* 増量セットBG：高次スキル第32弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The office added standing desks. Workers felt more energetic, back pain complaints fell, and afternoon slumps lessened.", q:"最も適切な要約は？", choices:["スタンディングデスクで活力が増し、腰痛の訴えと午後のだるさが減った。","机を撤去した。","活力が落ちた。","腰痛が増えた。"], explain:"立ち机→活力・腰痛減・だるさ減。" },
  { type:"summary", level:"B1", text:"The library lent out musical instruments. Beginners could try before buying, interest grew, and a community of players formed.", q:"最も適切な要約は？", choices:["楽器の貸出で購入前に試せ、関心が広がり演奏者の community ができた。","貸出をやめた。","関心が減った。","演奏者が消えた。"], explain:"楽器貸出→試用・関心・community。" },
  { type:"summary", level:"B2", text:"The team wrote down assumptions before each project. Misunderstandings dropped, surprises were rarer, and post-mortems got shorter.", q:"最も適切な要約は？", choices:["各プロジェクト前に前提を書き出し、誤解が減り驚きが少なく振り返りも短縮された。","前提を無視した。","誤解が増えた。","驚きが増えた。"], explain:"前提の明文化→誤解減・驚き減・振り返り短縮。" },
  { type:"summary", level:"B2", text:"The clinic sent appointment reminders by text. No-shows dropped sharply, schedules ran smoother, and patients appreciated it.", q:"最も適切な要約は？", choices:["予約リマインダーで無断キャンセルが激減し、予定が円滑になり患者にも好評だった。","通知をやめた。","欠席が増えた。","不評だった。"], explain:"リマインダー→無断キャンセル減・円滑・好評。" },
  { type:"summary", level:"C1", text:"By rewarding questions rather than only answers, the teacher created a class where not knowing felt safe and curiosity could thrive.", q:"最も適切な要約は？", choices:["答えだけでなく問いを評価し、分からないことが安全で好奇心が育つ教室を作った。","質問を禁じた。","好奇心が消えた。","不安が増えた。"], explain:"問いを評価→無知が安全→好奇心が育つ。" },
  { type:"paraphrase", level:"B1", text:"It depends.", q:"ほぼ同じ意味は？", choices:["It's not always the same.","It always works.","It never changes.","It's certain."], explain:"It depends ＝ 場合による。" },
  { type:"paraphrase", level:"B2", text:"Let's close the gap.", q:"ほぼ同じ意味は？", choices:["Let's reduce the difference.","Let's open the door.","Let's widen it.","Let's jump over."], explain:"close the gap ＝ 差を縮める。" },
  { type:"paraphrase", level:"C1", text:"Let's look for disconfirming evidence.", q:"ほぼ同じ意味は？", choices:["Let's seek evidence that could prove us wrong.","Let's confirm our view.","Let's hide the data.","Let's ignore facts."], explain:"disconfirming evidence ＝ 反証となる証拠。" },
  { type:"intensive", level:"B2", text:"Nowhere is this clearer than here.", q:"この文の意味は？", choices:["これほど明確な所は他にない。","どこも不明確だ。","ここは不明確だ。","他の所が明確だ。"], explain:"Nowhere + 倒置で強調。" },
  { type:"intensive", level:"C1", text:"Were we to fail, we would learn.", q:"この文の意味は？", choices:["仮に失敗しても学ぶだろう。","失敗したので学んだ。","失敗しなかった。","学ばなかった。"], explain:"Were we to … で仮定法の倒置。" },
  { type:"question", level:"B1", text:"理解の確認をしたい。", q:"最も適切な質問は？", choices:["Does that make sense?","Why sense always?","Can you ever get it?","Is sense hard?"], explain:"Does that make sense? で理解確認。" },
  { type:"question", level:"C1", text:"主張の限界を問いたい。", q:"最も適切な質問は？", choices:["Where does this argument break down?","Why break ever?","Is it perfect?","Can we skip?"], explain:"主張の限界を問い精度を上げる。" },
  { type:"response", level:"B1", text:"A: Could you double-check the numbers?", q:"自然な応答は？", choices:["Sure, I'll verify them.","Yes check fast me.","Why check always?","Check is hard."], explain:"依頼には Sure, I'll verify them. が自然。" },
  { type:"response", level:"C1", text:"A: Let's pressure-test the assumptions.", q:"自然な応答は？", choices:["Good—which one is shakiest?","No, just trust them.","Why test?","You never decide."], explain:"前提の検証に同意し弱点を問う。" },
  { type:"extensive", level:"B2", text:"The shop added a repair counter. Customers fixed instead of replacing, saved money, and the shop earned lasting loyalty.", q:"内容に合うものは？", choices:["修理カウンターで客が買い替えず直し、節約し店は持続的な愛顧を得た。","修理をやめた。","買い替えが増えた。","愛顧が落ちた。"], explain:"修理→節約・愛顧。" },
  { type:"extensive", level:"C1", text:"Faulted for slowing releases, the team's insistence on testing caught defects that would have damaged the brand's reputation.", q:"内容に合うものは？", choices:["リリースを遅らせると責められたが、検査の徹底が評判を傷つける欠陥を防いだ。","検査をやめた。","欠陥が残った。","評判が落ちた。"], explain:"検査の徹底→評判を守る欠陥発見。" }
]);

/* 増量セットBI：高次スキル第33弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The company offered free language classes. Employees gained skills, cross-team work improved, and morale rose noticeably.", q:"最も適切な要約は？", choices:["無料の語学講座でスキルが伸び、部門間連携が改善し士気が上がった。","講座を廃止した。","スキルが落ちた。","士気が下がった。"], explain:"語学講座→スキル・連携・士気。" },
  { type:"summary", level:"B2", text:"The team rotated who ran the meetings. Engagement rose, quieter members spoke up, and meetings became more efficient.", q:"最も適切な要約は？", choices:["会議の司会を交代制にし、参加度が上がり静かな人も発言し効率も上がった。","司会を固定した。","参加度が落ちた。","効率が下がった。"], explain:"司会交代→参加・発言・効率。" },
  { type:"summary", level:"C1", text:"By treating complaints as free consulting, the company turned its harshest critics into a steady source of product improvements.", q:"最も適切な要約は？", choices:["苦情を無料の助言とみなし、最も厳しい批判者を製品改善の源に変えた。","苦情を無視した。","批判者が離れた。","製品が悪化した。"], explain:"苦情＝無料の助言→批判者を改善源に。" },
  { type:"paraphrase", level:"B1", text:"It's on schedule.", q:"ほぼ同じ意味は？", choices:["It's going as planned.","It's late.","It's cancelled.","It's early."], explain:"on schedule ＝ 予定通り。" },
  { type:"paraphrase", level:"B2", text:"Let's re-evaluate the priorities.", q:"ほぼ同じ意味は？", choices:["Let's reconsider what matters most.","Let's lower the value.","Let's keep them fixed.","Let's ignore them."], explain:"re-evaluate ＝ 再評価する。" },
  { type:"paraphrase", level:"C1", text:"Let's check for bias.", q:"ほぼ同じ意味は？", choices:["Let's look for hidden prejudice.","Let's add weight.","Let's stay neutral always.","Let's skip review."], explain:"check for bias ＝ バイアスを確認する。" },
  { type:"intensive", level:"B2", text:"At no point did they give up.", q:"この文の意味は？", choices:["彼らは一度も諦めなかった。","すぐ諦めた。","時々諦めた。","最後に諦めた。"], explain:"At no point + 倒置で強い否定。" },
  { type:"intensive", level:"C1", text:"Should the need arise, we'll act.", q:"この文の意味は？", choices:["必要が生じれば行動する。","必要はない。","すでに行動した。","行動しない。"], explain:"Should the need arise で仮定法の倒置。" },
  { type:"question", level:"B1", text:"相手の準備状況を確かめたい。", q:"最も適切な質問は？", choices:["Are you all set?","Why set always?","Can you ever be ready?","Is set hard?"], explain:"Are you all set? で準備確認。" },
  { type:"question", level:"C1", text:"判断の反証条件を問いたい。", q:"最も適切な質問は？", choices:["What would change our minds?","Why change ever?","Is it fixed?","Can we skip?"], explain:"反証条件を問い柔軟性を保つ。" },
  { type:"response", level:"B1", text:"A: Could you keep me posted?", q:"自然な応答は？", choices:["Of course, I'll keep you updated.","Yes post fast me.","Why update always?","Post is hard."], explain:"依頼には Of course, I'll keep you updated. が自然。" },
  { type:"response", level:"C1", text:"A: Let's quantify before deciding.", q:"自然な応答は？", choices:["Agreed—what should we measure?","No, just guess.","Why measure?","You never decide."], explain:"定量化に同意し指標を尋ねる。" },
  { type:"extensive", level:"B2", text:"The office set up a 'kudos' channel. Recognition flowed freely, motivation grew, and teamwork strengthened over time.", q:"内容に合うものは？", choices:["称賛チャンネルで認め合いが広がり、意欲とチームワークが強まった。","廃止した。","意欲が落ちた。","対立が増えた。"], explain:"称賛の場→認め合い・意欲・チームワーク。" },
  { type:"extensive", level:"C1", text:"Mocked for asking 'obvious' questions, the new hire's curiosity exposed flawed assumptions everyone else had quietly accepted.", q:"内容に合うものは？", choices:["当たり前の質問を笑われたが、新人の好奇心が皆が黙認していた誤った前提を暴いた。","質問をやめた。","前提が残った。","好奇心が裏目に出た。"], explain:"素朴な問い→黙認された誤った前提を露呈。" }
]);

/* 増量セットBK：高次スキル第34弾 大量（5倍ペース） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The cafe started a 'pay it forward' board. Customers prepaid coffees for strangers, kindness spread, and regulars felt connected.", q:"最も適切な要約は？", choices:["先払い掲示で見知らぬ人へのコーヒーが贈られ、親切が広がり常連がつながった。","掲示をやめた。","親切が減った。","客が離れた。"], explain:"先払い→親切の連鎖・つながり。" },
  { type:"summary", level:"B2", text:"The team capped each task at one page of notes. Clarity improved, onboarding sped up, and knowledge stopped living in people's heads.", q:"最も適切な要約は？", choices:["各タスクのメモを1枚に制限し、明確化・新人受け入れ加速・知識の属人化解消を実現した。","メモを廃止した。","明確さが落ちた。","属人化が進んだ。"], explain:"1枚制限→明確化・加速・属人化解消。" },
  { type:"summary", level:"C1", text:"By scheduling regular 'pre-mortems,' the team imagined failure in advance and fixed weaknesses before they could cause real damage.", q:"最も適切な要約は？", choices:["事前検死を定例化し、失敗を先に想像して弱点を実害前に修正した。","検証をやめた。","弱点が残った。","失敗が増えた。"], explain:"プレモーテム→失敗を先取りし弱点を事前修正。" },
  { type:"paraphrase", level:"B1", text:"I'm counting on you.", q:"ほぼ同じ意味は？", choices:["I'm relying on you.","I'm counting numbers.","I'm leaving you.","I'm doubting you."], explain:"count on ＝ 頼りにする。" },
  { type:"paraphrase", level:"B2", text:"Let's keep it constructive.", q:"ほぼ同じ意味は？", choices:["Let's stay positive and helpful.","Let's build something.","Let's be harsh.","Let's destroy it."], explain:"constructive ＝ 建設的な。" },
  { type:"paraphrase", level:"C1", text:"Let's make our assumptions explicit.", q:"ほぼ同じ意味は？", choices:["Let's state what we're taking for granted.","Let's hide our ideas.","Let's stay vague.","Let's skip them."], explain:"make explicit ＝ 明示する。" },
  { type:"intensive", level:"B2", text:"Only then did it make sense.", q:"この文の意味は？", choices:["その時になって初めて腑に落ちた。","すぐ分かった。","分からなかった。","早く分かった。"], explain:"Only then + 倒置で『その時初めて』。" },
  { type:"intensive", level:"C1", text:"Far be it from me to object.", q:"この文の意味は？", choices:["反対する気は毛頭ない。","強く反対する。","反対した。","賛成しない。"], explain:"Far be it from me … で『〜する気はない』。" },
  { type:"question", level:"B1", text:"相手の希望を尋ねたい。", q:"最も適切な質問は？", choices:["What works best for you?","Why best always?","Can you ever choose?","Is best hard?"], explain:"What works best for you? で希望を尋ねる。" },
  { type:"question", level:"C1", text:"判断の前提を引き出したい。", q:"最も適切な質問は？", choices:["What are we taking for granted?","Why grant ever?","Is it given?","Can we skip?"], explain:"暗黙の前提を問い明示化する。" },
  { type:"response", level:"B1", text:"A: Could you summarize this?", q:"自然な応答は？", choices:["Sure, here's the gist.","Yes sum fast me.","Why summary always?","Sum is hard."], explain:"依頼には Sure, here's the gist. が自然。" },
  { type:"response", level:"C1", text:"A: Let's reason from first principles.", q:"自然な応答は？", choices:["Good—what do we know for certain?","No, just copy others.","Why think?","You never decide."], explain:"第一原理思考に同意し確実な事実を問う。" },
  { type:"extensive", level:"B2", text:"The library opened a quiet 'focus zone.' Students concentrated better, productivity rose, and demand for the space grew fast.", q:"内容に合うものは？", choices:["静かな集中ゾーンで集中が高まり、生産性が上がり需要も急増した。","ゾーンを撤去した。","集中が落ちた。","需要が減った。"], explain:"集中ゾーン→集中・生産性・需要。" },
  { type:"extensive", level:"C1", text:"Criticized for spending time on onboarding, the manager found that well-trained hires made fewer costly mistakes for years afterward.", q:"内容に合うものは？", choices:["受け入れに時間をかけると批判されたが、十分に育てた新人は何年も高くつく失敗を減らした。","受け入れをやめた。","失敗が増えた。","投資が無駄だった。"], explain:"丁寧な受け入れ→長期にわたり失敗減。" }
]);

/* 増量セットBL：高次スキル第35弾 仕上げ（5倍ペース完全達成） */
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The team posted its goals where everyone could see them. Focus sharpened, distractions fell, and progress became visible to all.", q:"最も適切な要約は？", choices:["目標を全員に見える所に掲示し、集中が増し脱線が減り進捗が可視化された。","目標を隠した。","集中が落ちた。","進捗が見えなくなった。"], explain:"目標の掲示→集中・脱線減・可視化。" },
  { type:"summary", level:"B2", text:"The company let teams set their own metrics. Ownership grew, the numbers became meaningful, and gaming the system mostly stopped.", q:"最も適切な要約は？", choices:["チームが自ら指標を決め、当事者意識が育ち数値が意味を持ち不正操作も減った。","指標を廃止した。","意識が薄れた。","不正が増えた。"], explain:"自律的な指標→当事者意識・意味・不正減。" },
  { type:"summary", level:"C1", text:"By rewarding people for surfacing problems rather than hiding them, the firm caught issues early and built a culture of candor.", q:"最も適切な要約は？", choices:["問題を隠さず表に出すことを評価し、早期発見と率直さの文化を築いた。","問題を隠した。","発見が遅れた。","率直さが消えた。"], explain:"問題の表出を評価→早期発見・率直な文化。" },
  { type:"paraphrase", level:"B1", text:"I'll keep that in mind.", q:"ほぼ同じ意味は？", choices:["I'll remember that.","I'll forget it.","I'll lose it.","I'll ignore it."], explain:"keep in mind ＝ 心に留める。" },
  { type:"paraphrase", level:"B2", text:"Let's surface the issues.", q:"ほぼ同じ意味は？", choices:["Let's bring the problems into the open.","Let's hide them.","Let's surf the web.","Let's ignore them."], explain:"surface ＝ 表に出す。" },
  { type:"paraphrase", level:"C1", text:"Let's reason from first principles.", q:"ほぼ同じ意味は？", choices:["Let's build up from basic truths.","Let's copy others.","Let's guess randomly.","Let's skip thinking."], explain:"first principles ＝ 第一原理。" },
  { type:"intensive", level:"B2", text:"Never before had we seen such growth.", q:"この文の意味は？", choices:["これほどの成長はかつてなかった。","よく見た。","成長は無かった。","少し成長した。"], explain:"Never before + 倒置で強調。" },
  { type:"intensive", level:"C1", text:"Little does it matter now.", q:"この文の意味は？", choices:["今となってはほとんど重要でない。","とても重要だ。","重要だった。","少し重要だ。"], explain:"Little + 倒置で『ほとんど〜ない』。" },
  { type:"question", level:"B1", text:"次の段取りを確認したい。", q:"最も適切な質問は？", choices:["What's the plan from here?","Why plan always?","Can we ever start?","Is plan hard?"], explain:"What's the plan from here? で段取り確認。" },
  { type:"question", level:"C1", text:"主張の反例を探りたい。", q:"最も適切な質問は？", choices:["Can we think of a counterexample?","Why example ever?","Is it always true?","Can we skip?"], explain:"反例を問い主張を検証する。" },
  { type:"response", level:"B1", text:"A: Could you take notes?", q:"自然な応答は？", choices:["Sure, I'll write them down.","Yes note fast me.","Why note always?","Note is hard."], explain:"依頼には Sure, I'll write them down. が自然。" },
  { type:"response", level:"C1", text:"A: Let's define the scope first.", q:"自然な応答は？", choices:["Agreed—what's in and what's out?","No, just start.","Why scope?","You never decide."], explain:"範囲の定義に同意し境界を問う。" },
  { type:"extensive", level:"B2", text:"The shop posted recipes using its ingredients. Sales rose, customers felt inspired, and food waste at home dropped.", q:"内容に合うものは？", choices:["食材を使うレシピを掲示し、売上が伸び客が刺激され家庭の食品ロスも減った。","レシピをやめた。","売上が落ちた。","ロスが増えた。"], explain:"レシピ掲示→売上・刺激・ロス減。" },
  { type:"extensive", level:"C1", text:"Dismissed as overly cautious, the auditor's careful review uncovered an error that would have cost the firm a fortune.", q:"内容に合うものは？", choices:["慎重すぎと退けられたが、監査の精査が巨額の損失を招く誤りを発見した。","監査をやめた。","誤りが残った。","慎重さが裏目に出た。"], explain:"丁寧な監査→巨額損失を招く誤りを発見。" }
]);

/* 増量セットBN：高次スキル第36弾 最終（5倍ペース完全達成）*/
window.EigoData.trainingItems = window.EigoData.trainingItems.concat([
  { type:"summary", level:"B1", text:"The team started celebrating small wins weekly. Motivation stayed high, burnout dropped, and people felt their work mattered.", q:"最も適切な要約は？", choices:["毎週小さな成功を祝い、意欲が保たれ燃え尽きが減り仕事の意義を感じた。","祝うのをやめた。","意欲が落ちた。","燃え尽きが増えた。"], explain:"小さな成功を祝う→意欲・燃え尽き減・意義。" },
  { type:"paraphrase", level:"B2", text:"Let's gauge the impact.", q:"ほぼ同じ意味は？", choices:["Let's estimate the effect.","Let's ignore it.","Let's increase it.","Let's measure water."], explain:"gauge ＝ 見積もる。" },
  { type:"intensive", level:"C1", text:"Seldom does such a chance arise.", q:"この文の意味は？", choices:["そんな機会はめったに訪れない。","よく訪れる。","訪れない。","すぐ訪れる。"], explain:"Seldom + 倒置で『めったに〜ない』。" },
  { type:"question", level:"B2", text:"判断の根拠を引き出したい。", q:"最も適切な質問は？", choices:["What's driving this decision?","Why drive always?","Is it real?","Can we skip?"], explain:"判断の根拠を問う。" },
  { type:"response", level:"C1", text:"A: Let's sanity-check the result.", q:"自然な応答は？", choices:["Good—does it pass a basic gut check?","No, just publish.","Why check?","You never decide."], explain:"結果の妥当性確認に同意。" },
  { type:"extensive", level:"B2", text:"The office added plants and natural light. Stress dropped, focus improved, and people lingered less reluctantly at their desks.", q:"内容に合うものは？", choices:["植物と自然光でストレスが減り集中が高まり、机に向かう気が楽になった。","植物を撤去した。","ストレスが増えた。","集中が落ちた。"], explain:"植物・自然光→ストレス減・集中。" },
  { type:"summary", level:"C1", text:"By measuring outcomes rather than hours, the company freed people to work smarter, and results improved without longer days.", q:"最も適切な要約は？", choices:["時間でなく成果で測り、賢く働けるようになり長時間労働なしに成果が向上した。","時間で測った。","成果が落ちた。","労働時間が増えた。"], explain:"成果で測る→賢い働き方・成果向上。" }
]);
