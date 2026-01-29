import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({ projectId: 'mark-454114' });

async function analyzeGroup(groupName: string, whereClause: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`【${groupName}】`);
  console.log('='.repeat(50));

  // 総数
  const countQuery = `
    SELECT COUNT(*) as total
    FROM \`mark-454114.autostudio_lstep.lstep_friends_raw\`
    WHERE ${whereClause}
  `;
  const [countRows] = await bigquery.query({ query: countQuery });
  const total = Number(countRows[0].total);
  console.log(`\n総数: ${total}人`);

  // 性別
  const genderQuery = `
    SELECT
      SUM(CAST(gender_male AS INT64)) as male,
      SUM(CAST(gender_female AS INT64)) as female
    FROM \`mark-454114.autostudio_lstep.lstep_friends_raw\`
    WHERE ${whereClause}
  `;
  const [genderRows] = await bigquery.query({ query: genderQuery });
  const male = Number(genderRows[0].male);
  const female = Number(genderRows[0].female);
  const genderUnknown = total - male - female;
  console.log(`\n【性別】`);
  console.log(`  男性: ${male}人 (${((male/total)*100).toFixed(1)}%)`);
  console.log(`  女性: ${female}人 (${((female/total)*100).toFixed(1)}%)`);
  if (genderUnknown > 0) console.log(`  未回答: ${genderUnknown}人`);

  // 年代
  const ageQuery = `
    SELECT
      SUM(CAST(\`20s\` AS INT64)) as age_20s,
      SUM(CAST(\`30s\` AS INT64)) as age_30s,
      SUM(CAST(\`40s\` AS INT64)) as age_40s,
      SUM(CAST(\`50s\` AS INT64)) as age_50s,
      SUM(CAST(\`60s\` AS INT64)) as age_60s
    FROM \`mark-454114.autostudio_lstep.lstep_friends_raw\`
    WHERE ${whereClause}
  `;
  const [ageRows] = await bigquery.query({ query: ageQuery });
  console.log(`\n【年代】`);
  console.log(`  20代: ${ageRows[0].age_20s}人`);
  console.log(`  30代: ${ageRows[0].age_30s}人`);
  console.log(`  40代: ${ageRows[0].age_40s}人`);
  console.log(`  50代: ${ageRows[0].age_50s}人`);
  console.log(`  60代: ${ageRows[0].age_60s}人`);

  // 職業
  const jobQuery = `
    SELECT
      SUM(CAST(job_student AS INT64)) as student,
      SUM(CAST(job_employee AS INT64)) as employee,
      SUM(CAST(job_housewife AS INT64)) as housewife,
      SUM(CAST(job_freelance AS INT64)) as freelance,
      SUM(CAST(job_business_owner AS INT64)) as owner
    FROM \`mark-454114.autostudio_lstep.lstep_friends_raw\`
    WHERE ${whereClause}
  `;
  const [jobRows] = await bigquery.query({ query: jobQuery });
  console.log(`\n【職業】`);
  console.log(`  学生: ${jobRows[0].student}人`);
  console.log(`  会社員: ${jobRows[0].employee}人`);
  console.log(`  主婦: ${jobRows[0].housewife}人`);
  console.log(`  フリーランス: ${jobRows[0].freelance}人`);
  console.log(`  経営者: ${jobRows[0].owner}人`);

  // 現在の売上
  const revenueQuery = `
    SELECT
      SUM(CAST(revenue_m1000manover AS INT64)) as r_1000over,
      SUM(CAST(revenue_m500to1000man AS INT64)) as r_500to1000,
      SUM(CAST(revenue_m100to500man AS INT64)) as r_100to500,
      SUM(CAST(revenue_m50to100man AS INT64)) as r_50to100,
      SUM(CAST(revenue_m10to50man AS INT64)) as r_10to50,
      SUM(CAST(revenue_m1to10man AS INT64)) as r_1to10,
      SUM(CAST(revenue_m0yen AS INT64)) as r_0
    FROM \`mark-454114.autostudio_lstep.lstep_friends_raw\`
    WHERE ${whereClause}
  `;
  const [revenueRows] = await bigquery.query({ query: revenueQuery });
  console.log(`\n【現在の売上】`);
  console.log(`  月1000万円以上: ${revenueRows[0].r_1000over}人`);
  console.log(`  月500〜1000万円: ${revenueRows[0].r_500to1000}人`);
  console.log(`  月100〜500万円: ${revenueRows[0].r_100to500}人`);
  console.log(`  月50〜100万円: ${revenueRows[0].r_50to100}人`);
  console.log(`  月10〜50万円: ${revenueRows[0].r_10to50}人`);
  console.log(`  月1〜10万円: ${revenueRows[0].r_1to10}人`);
  console.log(`  月0円: ${revenueRows[0].r_0}人`);

  // 目標売上
  const goalQuery = `
    SELECT
      SUM(CAST(goal_m1000manover AS INT64)) as g_1000over,
      SUM(CAST(goal_m500manover AS INT64)) as g_500over,
      SUM(CAST(goal_m300manover AS INT64)) as g_300over,
      SUM(CAST(goal_m100manover AS INT64)) as g_100over,
      SUM(CAST(goal_m50manover AS INT64)) as g_50over,
      SUM(CAST(goal_m10manover AS INT64)) as g_10over
    FROM \`mark-454114.autostudio_lstep.lstep_friends_raw\`
    WHERE ${whereClause}
  `;
  const [goalRows] = await bigquery.query({ query: goalQuery });
  console.log(`\n【目標売上】`);
  console.log(`  月1000万円以上: ${goalRows[0].g_1000over}人`);
  console.log(`  月500万円以上: ${goalRows[0].g_500over}人`);
  console.log(`  月300万円以上: ${goalRows[0].g_300over}人`);
  console.log(`  月100万円以上: ${goalRows[0].g_100over}人`);
  console.log(`  月50万円以上: ${goalRows[0].g_50over}人`);
  console.log(`  月10万円以上: ${goalRows[0].g_10over}人`);
}

async function main() {
  await analyzeGroup('勉強会申込者', 'CAST(tai2_study_applied AS INT64) = 1');
  await analyzeGroup('特典受け取り', 'CAST(tai2_bonus_received AS INT64) = 1');
  await analyzeGroup('購入者', 'CAST(tai2_purchased AS INT64) = 1');
}

main().catch(console.error);
