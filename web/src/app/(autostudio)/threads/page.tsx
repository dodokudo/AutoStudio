import { InsightsCard } from "./_components/insights-card";
import { CompetitorHighlights } from "./_components/competitor-highlight";
import { PostQueue } from "./_components/post-queue";

const mockInsights = {
  title: "アカウント概況 (直近7日)",
  stats: [
    { label: "平均フォロワー", value: "675", delta: "+42", deltaTone: "up" },
    { label: "平均プロフ閲覧", value: "2,263", delta: "+1,242", deltaTone: "up" },
    { label: "最高閲覧投稿", value: "112,926", delta: "@DHB7T5kzfLG" },
    { label: "承認待ち投稿", value: "10", delta: "本日生成" },
  ],
};

const mockHighlights = [
  {
    accountName: "門口 拓也",
    username: "mon_guchi",
    impressions: "89,298",
    likes: "60",
    summary:
      "フォロワー削除のノウハウ投稿。課題提示→削除手順→効果の流れが明確で、CTA はコメント欄で配布。",
    categories: ["構成: 課題→解決", "CTA: 詳細はコメント"],
  },
  {
    accountName: "20歳の私へ",
    username: "2_my_past_self",
    impressions: "55,000",
    likes: "761",
    summary:
      "共感ベースのストーリー型。冒頭フックで注意喚起→箇条書きで価値提供→最後にリンク誘導の黄金パターン。",
    categories: ["テーマ: マインド", "構成: ストーリー"],
  },
  {
    accountName: "ゆる麻布",
    impressions: "130,000",
    likes: "163",
    summary:
      "日常観察×問いかけ型。シンプルな一文と共感ワードで反応を稼ぎ、リンクで詳細へ誘導。",
    categories: ["テーマ: ライフスタイル"],
  },
  {
    accountName: "小林一美｜リピート率8割超えカウンセリング講師",
    username: "kazumi_kobayashi_",
    impressions: "110,000",
    likes: "113",
    summary:
      "リピート獲得術の HowTo。共感→課題→具体アクション→再現性で構成。コメント導線が秀逸。",
    categories: ["テーマ: サロン運営", "構成: 問題→手順"],
  },
];

const mockQueue = [
  {
    id: "plan-01",
    scheduledTime: "07:00",
    templateId: "hook_negate_v3",
    theme: "AI効率化",
    status: "draft" as const,
    mainText:
      "【メイン投稿】 ChatGPTで資料作成が5時間→5分に。\n\nやり方を3ステップで解説します。",
    comments: [
      { order: 1, text: "処理の手順をスクショ付きで解説。" },
      { order: 2, text: "CTA: LINE 登録でテンプレ配布。" },
    ],
  },
  {
    id: "plan-02",
    scheduledTime: "08:30",
    templateId: "cta_story_v1",
    theme: "AI学習術",
    status: "approved" as const,
    mainText:
      "【メイン投稿】 AIとの壁打ちでアイデア枯渇を防ぐ。経験談ベースで語りながら、コメントで具体プロンプトを配布。",
    comments: [{ order: 1, text: "プロンプト全文はこちら。" }],
  },
  {
    id: "plan-03",
    scheduledTime: "10:00",
    templateId: "competitor_pick_v2",
    theme: "競合分析",
    status: "scheduled" as const,
    mainText:
      "【メイン投稿】 直近で伸びた競合3選を分解。共通していた構成と CTA の使い方をまとめました。",
  },
];

export default function ThreadsHome() {
  return (
    <div className="space-y-10">
      <InsightsCard {...mockInsights} />
      <div className="grid gap-10 lg:grid-cols-[2fr,1.2fr]">
        <PostQueue items={mockQueue} />
        <CompetitorHighlights items={mockHighlights} />
      </div>
    </div>
  );
}
