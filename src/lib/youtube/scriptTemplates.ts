export const YOUTUBE_SCRIPT_TEMPLATE_IDS = [
  'roadmap',
  'live-demo',
  'niche-playbook',
  'case-study',
  'list-ranking',
  'deep-dive',
  'interview',
  'audit',
] as const;

export type YoutubeScriptTemplateId = (typeof YOUTUBE_SCRIPT_TEMPLATE_IDS)[number];

export interface YoutubeScriptTemplateSection {
  id: string;
  label: string;
  purpose: string;
  requirements: string[];
  weight: number;
}

export interface YoutubeScriptTemplate {
  id: YoutubeScriptTemplateId;
  label: string;
  shortLabel: string;
  description: string;
  bestFor: string;
  defaultDurationMinutes: number;
  sections: YoutubeScriptTemplateSection[];
}

export const YOUTUBE_SCRIPT_TEMPLATES: YoutubeScriptTemplate[] = [
  {
    id: 'roadmap',
    label: '完全ロードマップ型',
    shortLabel: 'ロードマップ',
    description: '0→成果までの全体像を、順番と到達基準つきで解説する王道型。',
    bestFor: '初心者向け完全攻略、フォロワー・売上など明確なゴール',
    defaultDurationMinutes: 30,
    sections: [
      {
        id: 'opening',
        label: '結果先出し・視聴メリット',
        purpose: '誰がどこまで到達できる動画かを冒頭で約束する。',
        requirements: ['対象者とゴールを数値で示す', '完成後の状態を先に見せる', '誇張せず根拠の所在を示す'],
        weight: 1,
      },
      {
        id: 'proof',
        label: '実績・信頼性',
        purpose: 'なぜこの手順を語れるのかを短く証明する。',
        requirements: ['実績素材を使う', '失敗または遠回りを1つ入れる', '証拠がない数字は作らない'],
        weight: 1,
      },
      {
        id: 'roadmap-overview',
        label: '全体ロードマップ',
        purpose: '本編の地図と各段階の到達基準を提示する。',
        requirements: ['3〜7段階に整理する', '順番に意味がある理由を説明する', '各段階の完了条件を示す'],
        weight: 1,
      },
      {
        id: 'foundation',
        label: 'STEP1 土台設計',
        purpose: 'テーマ、対象者、商品・ゴールを定める。',
        requirements: ['判断基準を示す', '具体例を1つ入れる', 'よくあるズレを指摘する'],
        weight: 2,
      },
      {
        id: 'research',
        label: 'STEP2 リサーチ',
        purpose: '需要と競合から勝ち筋を見つける。',
        requirements: ['見る項目をチェックリスト化する', '表面模倣と構造分析を分ける', 'リサーチ完了条件を示す'],
        weight: 2,
      },
      {
        id: 'execution',
        label: 'STEP3 実行手順',
        purpose: '視聴後にそのまま動ける具体手順を渡す。',
        requirements: ['操作または作業を時系列で説明する', '各手順の成果物を明示する', '実演・画面・図解の指示を入れる'],
        weight: 3,
      },
      {
        id: 'improvement',
        label: 'STEP4 検証・改善',
        purpose: '数値を見て改善するループを作る。',
        requirements: ['見る指標を絞る', '数値別の打ち手を示す', '改善周期を具体化する'],
        weight: 2,
      },
      {
        id: 'monetization',
        label: 'STEP5 収益化・次の段階',
        purpose: '成果を売上や次の成長へ接続する。',
        requirements: ['導線を分解する', '開始条件を示す', '短期施策と長期施策を分ける'],
        weight: 2,
      },
      {
        id: 'action-plan',
        label: '7日・30日アクションプラン',
        purpose: '情報を行動予定に変換する。',
        requirements: ['今日・7日以内・30日以内で分ける', '優先順位を示す', 'やらないことも示す'],
        weight: 1,
      },
      {
        id: 'ending',
        label: 'まとめ・CTA',
        purpose: '要点を圧縮し次の行動へ誘導する。',
        requirements: ['重要な3点を復唱する', 'LINE誘導の理由を内容につなげる', '指定キーワードを自然に案内する'],
        weight: 1,
      },
    ],
  },
  {
    id: 'live-demo',
    label: '実演・画面公開型',
    shortLabel: '実演',
    description: '操作画面や制作過程を見せ、入力から完成までを追体験させる型。',
    bestFor: 'AIツール、投稿作成、アカウント設計、作業効率化',
    defaultDurationMinutes: 20,
    sections: [
      { id: 'opening', label: '完成形の先出し', purpose: '最終成果物を最初に見せる。', requirements: ['ビフォーアフターを提示する', '所要時間と対象者を示す', '完成画面の収録指示を入れる'], weight: 1 },
      { id: 'setup', label: '前提・準備物', purpose: '視聴者が同じ環境を用意できるようにする。', requirements: ['必要なツールと素材を列挙する', '有料・無料条件を明示する', '開始地点を揃える'], weight: 1 },
      { id: 'demo-1', label: '実演1 入力・初期設定', purpose: '最初の操作を迷わず再現させる。', requirements: ['クリック箇所を具体化する', '入力例を読み上げる', '画面拡大やテロップの指示を入れる'], weight: 2 },
      { id: 'demo-2', label: '実演2 作成・調整', purpose: '品質を分ける主要工程を見せる。', requirements: ['初回出力をそのまま採用しない', '修正理由を言語化する', '悪い例との違いを見せる'], weight: 3 },
      { id: 'demo-3', label: '実演3 完成・公開準備', purpose: '成果物を利用可能な状態まで仕上げる。', requirements: ['完成条件を示す', '公開前チェックを行う', '保存・書き出し方法を説明する'], weight: 2 },
      { id: 'validation', label: '結果検証', purpose: '完成物が約束を満たしたか確認する。', requirements: ['冒頭の完成形と比較する', '時間・品質・コストを評価する', 'できなかった点も正直に示す'], weight: 1 },
      { id: 'mistakes', label: '失敗しやすいポイント', purpose: '再現時のつまずきを先回りする。', requirements: ['典型的な失敗を3つまで示す', '原因と直し方を対にする', '代替手段を用意する'], weight: 1 },
      { id: 'ending', label: 'チェックリスト・CTA', purpose: '再現用の要点と次の行動を渡す。', requirements: ['手順を短く復唱する', '配布物との接続を示す', 'LINEキーワードを案内する'], weight: 1 },
    ],
  },
  {
    id: 'niche-playbook',
    label: '特定ジャンル攻略型',
    shortLabel: 'ジャンル攻略',
    description: '特定業種・テーマに絞り、集客から収益化までの勝ち筋を解説する型。',
    bestFor: '店舗、士業、副業、アフィリエイト、noteなどの個別市場',
    defaultDurationMinutes: 25,
    sections: [
      { id: 'opening', label: '市場機会・結論', purpose: 'このジャンルで取り組む価値を明示する。', requirements: ['誰向けかを限定する', '機会と注意点を両方示す', '根拠がない市場数字を作らない'], weight: 1 },
      { id: 'customer', label: '顧客と悩みの解像度', purpose: '狙う相手と購入理由を具体化する。', requirements: ['顧客の場面・感情・検索語を描く', '表面的な悩みと本音を分ける', '対象外も示す'], weight: 2 },
      { id: 'offer', label: '商品・オファー設計', purpose: '何をどの条件で売るかを決める。', requirements: ['成果物を明示する', '価格の考え方を示す', '初回商品と継続商品を分ける'], weight: 2 },
      { id: 'positioning', label: 'アカウント・立ち位置', purpose: '競合と違う選ばれる理由を作る。', requirements: ['肩書き・約束・証拠を揃える', '避けるポジションを示す', 'プロフィール例を入れる'], weight: 2 },
      { id: 'content', label: '発信テーマ・投稿設計', purpose: '見込み客が集まる発信を設計する。', requirements: ['3〜5本の柱を示す', '認知・信頼・販売で役割を分ける', '投稿例を複数入れる'], weight: 3 },
      { id: 'funnel', label: '集客・販売導線', purpose: '閲覧から成約までを一本につなぐ。', requirements: ['各接点の役割を説明する', 'CTA例を示す', '離脱しやすい箇所を示す'], weight: 2 },
      { id: 'risks', label: '注意点・失敗例', purpose: 'ジャンル固有のリスクを回避する。', requirements: ['規約・表現・信頼性の注意を含める', '失敗例と改善例を対比する', '不明点は要確認と示す'], weight: 1 },
      { id: 'ending', label: '初月プラン・CTA', purpose: '最初の30日でやることを明確にする。', requirements: ['週単位に分ける', '最初の成果指標を示す', 'LINEキーワードを案内する'], weight: 1 },
    ],
  },
  {
    id: 'case-study',
    label: '実績検証・挑戦記録型',
    shortLabel: '検証・挑戦',
    description: '開始条件、施策、推移、結果を時系列で公開し、再現条件を抽出する型。',
    bestFor: '0→1000人、30日検証、売上公開、施策のビフォーアフター',
    defaultDurationMinutes: 20,
    sections: [
      { id: 'opening', label: '結果・期間・開始条件', purpose: '検証の全体像を一文で伝える。', requirements: ['開始値・終了値・期間を示す', '証拠映像の指示を入れる', '結果を盛らない'], weight: 1 },
      { id: 'hypothesis', label: '課題と仮説', purpose: '何を確かめる検証だったか定義する。', requirements: ['当初の課題を示す', '採用した仮説を一つに絞る', '成功条件を数値化する'], weight: 1 },
      { id: 'timeline', label: '実行タイムライン', purpose: '施策と変化を時系列で見せる。', requirements: ['週または節目ごとに整理する', '実際にやった作業を示す', '変更点と判断理由を含める'], weight: 3 },
      { id: 'metrics', label: '数値と証拠', purpose: '結果を検証可能な形で示す。', requirements: ['主要指標を3つ以内に絞る', '画面キャプチャ位置を指示する', '相関と因果を混同しない'], weight: 2 },
      { id: 'failures', label: '失敗・想定外', purpose: 'うまくいかなかった点から信頼と学びを作る。', requirements: ['失敗を具体化する', '損失または影響を示す', 'どう修正したか説明する'], weight: 2 },
      { id: 'analysis', label: '成功要因・限界', purpose: '何が効き、何は再現できないか分ける。', requirements: ['要因を優先順位づけする', '外部要因を認める', '再現条件と非再現条件を示す'], weight: 2 },
      { id: 'playbook', label: '視聴者向け再現手順', purpose: '検証結果を他者が使える方法に変える。', requirements: ['3〜5手順にする', '最小構成を示す', '次に検証する項目を示す'], weight: 2 },
      { id: 'ending', label: '次回検証・CTA', purpose: 'シリーズ継続と次の行動へつなげる。', requirements: ['次回の仮説を予告する', '視聴者の実行を促す', 'LINEキーワードを案内する'], weight: 1 },
    ],
  },
  {
    id: 'list-ranking',
    label: 'リスト・ランキング型',
    shortLabel: 'リスト',
    description: '複数の選択肢を共通基準で比較し、視聴者が自分向けを選べるようにする型。',
    bestFor: 'おすすめ○選、失敗○選、ツール比較、投稿ネタ集',
    defaultDurationMinutes: 18,
    sections: [
      { id: 'opening', label: '約束・選定基準', purpose: '何を何基準で選んだか宣言する。', requirements: ['対象者を明示する', '選定基準を3つ以内で示す', '一位だけの煽りにしない'], weight: 1 },
      { id: 'quick-answer', label: '先に結論・早見表', purpose: '時間がない人にも選択肢を渡す。', requirements: ['用途別の結論を先出しする', '一覧図の指示を入れる', '本編で判断理由を説明すると予告する'], weight: 1 },
      { id: 'items', label: '各項目の解説', purpose: '共通フォーマットで各候補を評価する。', requirements: ['各項目を 結論→理由→例→向く人→注意点 の順で話す', '同じ評価軸を維持する', '具体的な利用場面を入れる'], weight: 7 },
      { id: 'comparison', label: '横断比較', purpose: '候補間の違いを一画面で整理する。', requirements: ['比較表の指示を入れる', '価格・難易度・効果など主要軸に絞る', '優劣ではなく用途差も示す'], weight: 2 },
      { id: 'choice-guide', label: 'タイプ別の選び方', purpose: '視聴者が自分向けの結論を出せるようにする。', requirements: ['初心者・経験者などで分ける', '迷った場合の第一選択を示す', '避ける条件も示す'], weight: 2 },
      { id: 'ending', label: '最初の一歩・CTA', purpose: '選択から実行へ移す。', requirements: ['今日試す一つを決めさせる', '一覧または資料の価値を示す', 'LINEキーワードを案内する'], weight: 1 },
    ],
  },
  {
    id: 'deep-dive',
    label: '単一テーマ深掘り型',
    shortLabel: '深掘り',
    description: '一つの重要論点を、仕組み・診断・改善例まで掘り下げる型。',
    bestFor: 'アルゴリズム、タイトル、ファン化、伸びない原因、設計思想',
    defaultDurationMinutes: 20,
    sections: [
      { id: 'opening', label: '誤解・核心の提示', purpose: 'よくある誤解を崩し、真の論点を示す。', requirements: ['対象者の症状を言語化する', '意外性だけでなく結論を示す', '視聴後にできることを約束する'], weight: 1 },
      { id: 'mechanism', label: '仕組み・原理', purpose: 'なぜその現象が起きるか理解させる。', requirements: ['原因と結果を図解する', '専門語を日常語に置き換える', '断定できない点は分ける'], weight: 3 },
      { id: 'diagnosis', label: '自己診断', purpose: '視聴者が自分の問題箇所を特定できるようにする。', requirements: ['チェック項目を3〜7個示す', '症状別に原因候補を分ける', '診断例を入れる'], weight: 2 },
      { id: 'method', label: '改善メソッド', purpose: '原理を実践手順に落とし込む。', requirements: ['順序立てて説明する', '各手順の判断基準を示す', '最小の改善から始める'], weight: 3 },
      { id: 'examples', label: '良い例・悪い例', purpose: '抽象論を比較可能な具体例に変える。', requirements: ['同じ題材で前後比較する', '違いを言語化する', '画面・テロップ指示を入れる'], weight: 2 },
      { id: 'pitfalls', label: '例外・落とし穴', purpose: '方法を誤用するリスクを防ぐ。', requirements: ['効かない条件を示す', 'やり過ぎのサインを示す', '代替案を入れる'], weight: 1 },
      { id: 'ending', label: '実践チェック・CTA', purpose: '一つの改善行動に集約する。', requirements: ['要点を3つに圧縮する', '24時間以内の行動を示す', 'LINEキーワードを案内する'], weight: 1 },
    ],
  },
  {
    id: 'interview',
    label: '対談・インタビュー型',
    shortLabel: '対談',
    description: 'ゲストの経験を時系列と方法論に整理し、再現可能な学びを引き出す型。',
    bestFor: '成功者対談、専門家解説、顧客事例、コラボ企画',
    defaultDurationMinutes: 35,
    sections: [
      { id: 'opening', label: '見どころ・結果先出し', purpose: '最も強い発言と得られる学びを冒頭に置く。', requirements: ['ハイライトを先出しする', 'ゲストの実績を一文で紹介する', '対談のゴールを示す'], weight: 1 },
      { id: 'context', label: '開始地点・背景', purpose: '成果前の状況を具体化する。', requirements: ['当時の数値や環境を聞く', '課題と感情を分けて聞く', '後付けの成功談にしない'], weight: 2 },
      { id: 'turning-point', label: '転機・意思決定', purpose: '変化を生んだ判断を特定する。', requirements: ['何をやめ何を始めたか聞く', '判断材料を深掘る', '転機の前後を比較する'], weight: 2 },
      { id: 'process', label: '具体的な方法・プロセス', purpose: '成果までの実務を再現可能にする。', requirements: ['時系列で聞く', '抽象回答には具体例を求める', '使用ツール・頻度・時間を聞く'], weight: 4 },
      { id: 'evidence', label: '結果・証拠・変化', purpose: '方法と結果のつながりを検証する。', requirements: ['定量と定性の両方を聞く', '証拠画面の挿入位置を示す', '外部要因も確認する'], weight: 2 },
      { id: 'failures', label: '失敗・遠回り', purpose: '視聴者が避けるべき道を明らかにする。', requirements: ['一番痛かった失敗を聞く', 'なぜ起きたか掘る', '今ならどうするか聞く'], weight: 2 },
      { id: 'rapid-fire', label: '一問一答・要点回収', purpose: '実用的な判断基準を短く回収する。', requirements: ['初心者への一歩を聞く', 'やらないことを聞く', '今後の予測を聞く'], weight: 1 },
      { id: 'ending', label: 'ホストまとめ・CTA', purpose: '対談を行動できる学びに整理する。', requirements: ['学びを3点にまとめる', 'ゲスト紹介と視聴者CTAを分ける', 'LINEキーワードを案内する'], weight: 1 },
    ],
  },
  {
    id: 'audit',
    label: '添削・公開コンサル型',
    shortLabel: '添削',
    description: '実例を診断し、原因・優先順位・修正案をその場で示す型。',
    bestFor: 'アカウント添削、プロフィール改善、投稿レビュー、導線診断',
    defaultDurationMinutes: 25,
    sections: [
      { id: 'opening', label: '相談内容・ゴール', purpose: '何をどこまで改善する回か定義する。', requirements: ['本人の目標を示す', '現状の主要数値を示す', '公開範囲や前提を明示する'], weight: 1 },
      { id: 'first-impression', label: '初見診断', purpose: '顧客目線で最初に受ける印象を言語化する。', requirements: ['良い点から示す', '3秒・10秒・30秒の印象を分ける', '印象と事実を混同しない'], weight: 2 },
      { id: 'evidence', label: 'データ・現物確認', purpose: '主観だけでなく実物と数値から問題を絞る。', requirements: ['画面・投稿・指標を確認する', '事実と仮説をラベル分けする', '不足データを要確認と示す'], weight: 2 },
      { id: 'root-causes', label: '根本原因', purpose: '表面的な症状の下にある原因を特定する。', requirements: ['原因を3つ以内に絞る', '因果関係を説明する', '本人の強みも改善材料にする'], weight: 2 },
      { id: 'priority-fixes', label: '優先順位つき改善策', purpose: '効果と工数で直す順番を決める。', requirements: ['今すぐ・次・後回しに分ける', '各改善の狙いを示す', 'やらない施策も示す'], weight: 3 },
      { id: 'rewrite', label: 'その場で修正・ビフォーアフター', purpose: '助言を完成例として見せる。', requirements: ['修正前後を並べる', '変更理由を一行ずつ説明する', '本人らしさを消さない'], weight: 3 },
      { id: 'plan', label: '7日・30日改善計画', purpose: '添削後の実行と測定を設計する。', requirements: ['期限と担当を示す', '追う指標を決める', '再診断の条件を示す'], weight: 2 },
      { id: 'ending', label: '視聴者への応用・CTA', purpose: '個別事例を全視聴者の学びに広げる。', requirements: ['転用できる原則を3点示す', 'セルフチェックを促す', 'LINEキーワードを案内する'], weight: 1 },
    ],
  },
];

export const DEFAULT_YOUTUBE_SCRIPT_TEMPLATE_ID: YoutubeScriptTemplateId = 'roadmap';

export function isYoutubeScriptTemplateId(value: unknown): value is YoutubeScriptTemplateId {
  return typeof value === 'string' && YOUTUBE_SCRIPT_TEMPLATE_IDS.includes(value as YoutubeScriptTemplateId);
}

export function getYoutubeScriptTemplate(id: YoutubeScriptTemplateId): YoutubeScriptTemplate {
  return YOUTUBE_SCRIPT_TEMPLATES.find((template) => template.id === id) ?? YOUTUBE_SCRIPT_TEMPLATES[0];
}

export function getSectionTargetMinutes(
  template: YoutubeScriptTemplate,
  durationMinutes: number,
  sectionWeight: number,
): number {
  const totalWeight = template.sections.reduce((sum, section) => sum + section.weight, 0);
  return Math.max(0.5, Math.round((durationMinutes * sectionWeight * 2) / totalWeight) / 2);
}
