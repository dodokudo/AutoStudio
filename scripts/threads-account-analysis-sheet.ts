import ExcelJS from 'exceljs';
import * as path from 'path';

async function main() {
  console.log('アカウント分析シートを作成中...');

  const workbook = new ExcelJS.Workbook();

  // ========================================
  // シート1: アカウントインサイト
  // ========================================
  const sheet1 = workbook.addWorksheet('アカウントインサイト');

  // 列設定
  sheet1.columns = [
    { header: '日付', key: 'date', width: 12 },
    { header: '曜日', key: 'weekday', width: 6 },
    { header: 'インプレッション', key: 'impressions', width: 16 },
    { header: 'フォロワー数', key: 'followers', width: 14 },
    { header: 'フォロワー増減', key: 'follower_change', width: 14 },
    { header: '新規フォロワー', key: 'new_followers', width: 14 },
    { header: 'LINE登録数', key: 'line_registrations', width: 12 },
    { header: 'LINE登録率', key: 'line_rate', width: 12 },
  ];

  // ヘッダースタイル
  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  };

  sheet1.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });
  sheet1.getRow(1).height = 24;

  // 31日分のデータ行を追加（数式付き）
  const startDate = new Date('2026-01-01');
  for (let i = 0; i < 31; i++) {
    const rowNum = i + 2;
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);

    const row = sheet1.getRow(rowNum);

    // A列: 日付（自動生成）
    row.getCell('A').value = currentDate;
    row.getCell('A').numFmt = 'yyyy/mm/dd';

    // B列: 曜日（数式で自動計算）
    row.getCell('B').value = { formula: `TEXT(A${rowNum},"aaa")` };

    // C列: インプレッション（手動入力）
    row.getCell('C').value = null;
    row.getCell('C').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // D列: フォロワー数（手動入力）
    row.getCell('D').value = null;
    row.getCell('D').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // E列: フォロワー増減（数式で自動計算）
    if (i === 0) {
      row.getCell('E').value = { formula: `IF(D${rowNum}="","",D${rowNum})` };
    } else {
      row.getCell('E').value = { formula: `IF(OR(D${rowNum}="",D${rowNum - 1}=""),"",D${rowNum}-D${rowNum - 1})` };
    }

    // F列: 新規フォロワー（手動入力）
    row.getCell('F').value = null;
    row.getCell('F').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // G列: LINE登録数（手動入力）
    row.getCell('G').value = null;
    row.getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // H列: LINE登録率（数式で自動計算）
    row.getCell('H').value = { formula: `IF(OR(G${rowNum}="",F${rowNum}="",F${rowNum}=0),"",G${rowNum}/F${rowNum})` };
    row.getCell('H').numFmt = '0.0%';

    // 罫線
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });
  }

  // 凡例追加
  const legendRow1 = sheet1.getRow(35);
  legendRow1.getCell('A').value = '【凡例】';
  legendRow1.getCell('A').font = { bold: true };

  const legendRow2 = sheet1.getRow(36);
  legendRow2.getCell('A').value = '黄色セル';
  legendRow2.getCell('A').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  legendRow2.getCell('B').value = '= 手動入力';

  // ========================================
  // シート2: 投稿パフォーマンス
  // ========================================
  const sheet2 = workbook.addWorksheet('投稿パフォーマンス');

  sheet2.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: '投稿日', key: 'post_date', width: 12 },
    { header: '投稿URL', key: 'url', width: 45 },
    { header: 'インプレッション', key: 'impressions', width: 16 },
    { header: 'いいね数', key: 'likes', width: 10 },
    { header: 'いいね率', key: 'like_rate', width: 10 },
    { header: 'コメント1表示', key: 'comment1', width: 14 },
    { header: 'コメント1遷移率', key: 'comment1_rate', width: 14 },
    { header: 'コメント2表示', key: 'comment2', width: 14 },
    { header: 'コメント2遷移率', key: 'comment2_rate', width: 14 },
    { header: 'コメント3表示', key: 'comment3', width: 14 },
    { header: 'コメント3遷移率', key: 'comment3_rate', width: 14 },
  ];

  sheet2.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });
  sheet2.getRow(1).height = 24;

  // 50行分のデータ行を追加
  for (let i = 0; i < 50; i++) {
    const rowNum = i + 2;
    const row = sheet2.getRow(rowNum);

    // A列: No（自動連番）
    row.getCell('A').value = { formula: `ROW()-1` };

    // B列: 投稿日（手動入力）
    row.getCell('B').value = null;
    row.getCell('B').numFmt = 'yyyy/mm/dd';
    row.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // C列: 投稿URL（手動入力）
    row.getCell('C').value = null;
    row.getCell('C').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // D列: インプレッション（手動入力）
    row.getCell('D').value = null;
    row.getCell('D').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // E列: いいね数（手動入力）
    row.getCell('E').value = null;
    row.getCell('E').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // F列: いいね率（数式で自動計算）
    row.getCell('F').value = { formula: `IF(OR(E${rowNum}="",D${rowNum}="",D${rowNum}=0),"",E${rowNum}/D${rowNum})` };
    row.getCell('F').numFmt = '0.00%';

    // G列: コメント1表示（手動入力）
    row.getCell('G').value = null;
    row.getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // H列: コメント1遷移率（数式で自動計算）
    row.getCell('H').value = { formula: `IF(OR(G${rowNum}="",D${rowNum}="",D${rowNum}=0),"",G${rowNum}/D${rowNum})` };
    row.getCell('H').numFmt = '0.0%';

    // I列: コメント2表示（手動入力）
    row.getCell('I').value = null;
    row.getCell('I').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // J列: コメント2遷移率（数式で自動計算 - コメント1からの遷移）
    row.getCell('J').value = { formula: `IF(OR(I${rowNum}="",G${rowNum}="",G${rowNum}=0),"",I${rowNum}/G${rowNum})` };
    row.getCell('J').numFmt = '0.0%';

    // K列: コメント3表示（手動入力）
    row.getCell('K').value = null;
    row.getCell('K').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    // L列: コメント3遷移率（数式で自動計算 - コメント2からの遷移）
    row.getCell('L').value = { formula: `IF(OR(K${rowNum}="",I${rowNum}="",I${rowNum}=0),"",K${rowNum}/I${rowNum})` };
    row.getCell('L').numFmt = '0.0%';

    // 罫線
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 12) {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });
  }

  // 凡例
  const legend2Row1 = sheet2.getRow(54);
  legend2Row1.getCell('A').value = '【凡例】';
  legend2Row1.getCell('A').font = { bold: true };

  const legend2Row2 = sheet2.getRow(55);
  legend2Row2.getCell('A').value = '黄色セル';
  legend2Row2.getCell('A').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  legend2Row2.getCell('B').value = '= 手動入力';

  const legend2Row3 = sheet2.getRow(56);
  legend2Row3.getCell('A').value = '※コメント遷移率は前段階からの遷移率';

  // ========================================
  // シート3: サマリー
  // ========================================
  const sheet3 = workbook.addWorksheet('サマリー');

  // 週別サマリー
  sheet3.getCell('A1').value = '【週別サマリー】';
  sheet3.getCell('A1').font = { bold: true, size: 14 };

  sheet3.getCell('A3').value = '週';
  sheet3.getCell('B3').value = '開始日';
  sheet3.getCell('C3').value = '終了日';
  sheet3.getCell('D3').value = '総インプレッション';
  sheet3.getCell('E3').value = '平均インプレッション';
  sheet3.getCell('F3').value = 'フォロワー増減';
  sheet3.getCell('G3').value = 'LINE登録数';
  sheet3.getCell('H3').value = '投稿数';

  sheet3.getRow(3).eachCell((cell, colNum) => {
    if (colNum <= 8) {
      cell.style = headerStyle;
    }
  });

  // 5週分の数式
  for (let week = 1; week <= 5; week++) {
    const rowNum = week + 3;
    const startRow = (week - 1) * 7 + 2;
    const endRow = Math.min(week * 7 + 1, 32);

    const row = sheet3.getRow(rowNum);

    row.getCell('A').value = `第${week}週`;

    // 開始日・終了日
    row.getCell('B').value = { formula: `アカウントインサイト!A${startRow}` };
    row.getCell('B').numFmt = 'mm/dd';
    row.getCell('C').value = { formula: `アカウントインサイト!A${endRow}` };
    row.getCell('C').numFmt = 'mm/dd';

    // 総インプレッション
    row.getCell('D').value = { formula: `SUM(アカウントインサイト!C${startRow}:C${endRow})` };
    row.getCell('D').numFmt = '#,##0';

    // 平均インプレッション
    row.getCell('E').value = { formula: `IFERROR(AVERAGE(アカウントインサイト!C${startRow}:C${endRow}),"")` };
    row.getCell('E').numFmt = '#,##0';

    // フォロワー増減（週末-週初）
    row.getCell('F').value = { formula: `IF(OR(アカウントインサイト!D${endRow}="",アカウントインサイト!D${startRow}=""),"",アカウントインサイト!D${endRow}-アカウントインサイト!D${startRow})` };

    // LINE登録数
    row.getCell('G').value = { formula: `SUM(アカウントインサイト!G${startRow}:G${endRow})` };

    // 投稿数（その週の投稿をカウント）
    row.getCell('H').value = { formula: `COUNTIFS(投稿パフォーマンス!B:B,">="&B${rowNum},投稿パフォーマンス!B:B,"<="&C${rowNum})` };

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum <= 8) {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });
  }

  // 月間サマリー
  sheet3.getCell('A12').value = '【月間サマリー】';
  sheet3.getCell('A12').font = { bold: true, size: 14 };

  sheet3.getCell('A14').value = '項目';
  sheet3.getCell('B14').value = '値';
  sheet3.getRow(14).eachCell((cell, colNum) => {
    if (colNum <= 2) {
      cell.style = headerStyle;
    }
  });

  const monthlyMetrics = [
    { label: '総インプレッション', formula: 'SUM(アカウントインサイト!C:C)' },
    { label: '平均日次インプレッション', formula: 'IFERROR(AVERAGE(アカウントインサイト!C:C),"")' },
    { label: '月初フォロワー数', formula: 'アカウントインサイト!D2' },
    { label: '月末フォロワー数', formula: 'LOOKUP(2,1/(アカウントインサイト!D:D<>""),アカウントインサイト!D:D)' },
    { label: 'フォロワー増加数', formula: 'IFERROR(B18-B17,"")' },
    { label: 'フォロワー増加率', formula: 'IFERROR(B19/B17,"")' },
    { label: '総LINE登録数', formula: 'SUM(アカウントインサイト!G:G)' },
    { label: '投稿数', formula: 'COUNTA(投稿パフォーマンス!C:C)-1' },
    { label: '平均いいね率', formula: 'IFERROR(AVERAGE(投稿パフォーマンス!F:F),"")' },
    { label: '平均コメント1遷移率', formula: 'IFERROR(AVERAGE(投稿パフォーマンス!H:H),"")' },
  ];

  monthlyMetrics.forEach((metric, i) => {
    const rowNum = 15 + i;
    const row = sheet3.getRow(rowNum);
    row.getCell('A').value = metric.label;
    row.getCell('B').value = { formula: metric.formula };

    // フォーマット設定
    if (metric.label.includes('率')) {
      row.getCell('B').numFmt = '0.00%';
    } else if (metric.label.includes('数') || metric.label.includes('インプレッション')) {
      row.getCell('B').numFmt = '#,##0';
    }

    row.eachCell((cell, colNum) => {
      if (colNum <= 2) {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });
  });

  // 投稿パフォーマンスTOP5
  sheet3.getCell('A28').value = '【投稿パフォーマンスTOP5】';
  sheet3.getCell('A28').font = { bold: true, size: 14 };

  sheet3.getCell('A30').value = '順位';
  sheet3.getCell('B30').value = 'インプレッション';
  sheet3.getCell('C30').value = 'いいね率';
  sheet3.getRow(30).eachCell((cell, colNum) => {
    if (colNum <= 3) {
      cell.style = headerStyle;
    }
  });

  for (let i = 1; i <= 5; i++) {
    const rowNum = 30 + i;
    const row = sheet3.getRow(rowNum);
    row.getCell('A').value = i;
    row.getCell('B').value = { formula: `IFERROR(LARGE(投稿パフォーマンス!D:D,${i}),"")` };
    row.getCell('B').numFmt = '#,##0';
    row.getCell('C').value = { formula: `IFERROR(INDEX(投稿パフォーマンス!F:F,MATCH(B${rowNum},投稿パフォーマンス!D:D,0)),"")` };
    row.getCell('C').numFmt = '0.00%';

    row.eachCell((cell, colNum) => {
      if (colNum <= 3) {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      }
    });
  }

  // 列幅調整
  sheet3.getColumn('A').width = 24;
  sheet3.getColumn('B').width = 18;
  sheet3.getColumn('C').width = 12;
  sheet3.getColumn('D').width = 18;
  sheet3.getColumn('E').width = 18;
  sheet3.getColumn('F').width = 14;
  sheet3.getColumn('G').width = 14;
  sheet3.getColumn('H').width = 10;

  // ========================================
  // 保存
  // ========================================
  const outputPath = path.join(process.env.HOME || '/tmp', 'Downloads', 'threads_account_analysis.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n保存完了: ${outputPath}`);
  console.log('\n【シート構成】');
  console.log('1. アカウントインサイト - 日次のアカウント数値（黄色=手動入力、他は自動計算）');
  console.log('2. 投稿パフォーマンス - 各投稿の詳細数値（黄色=手動入力、他は自動計算）');
  console.log('3. サマリー - 週別・月間の集計（すべて自動計算）');
}

main().catch(console.error);
