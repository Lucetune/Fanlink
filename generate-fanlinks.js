// Fanlink 自动生成系统
// 使用方法：node generate-fanlinks.js

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// 配置常量
const SONGS_JSON_PATH = path.join(__dirname, 'songs.json');
const TEMPLATE_PATH = path.join(__dirname, 'index.html');
const COVER_DIR = path.join(__dirname, 'cover');
const DIST_DIR = path.join(__dirname, 'artist');
const OPTIMIZE_SCRIPT_PATH = path.join(__dirname, 'optimize-images.js');

// 确保目录存在
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`创建目录: ${dirPath}`);
  }
}

// 读取JSON数据
function readSongsData() {
  try {
    const data = fs.readFileSync(SONGS_JSON_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取 songs.json 失败:', error.message);
    process.exit(1);
  }
}

// 规范化厂牌名称为URL友好格式
function normalizeLabelName(labelName) {
  return labelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// 处理厂牌重名冲突，确保厂牌ID唯一
function resolveLabelConflicts(songs) {
  const labelNameToIds = new Map();
  const labelNameToCount = new Map();
  
  // 第一次遍历：统计每个厂牌名出现的次数和已使用的ID
  songs.forEach(song => {
    const normalizedLabel = normalizeLabelName(song.label_name);
    
    // 统计厂牌名出现次数
    labelNameToCount.set(normalizedLabel, (labelNameToCount.get(normalizedLabel) || 0) + 1);
    
    // 统计每个厂牌名已使用的ID
    if (!labelNameToIds.has(normalizedLabel)) {
      labelNameToIds.set(normalizedLabel, new Set());
    }
    if (song.label_id) {
      labelNameToIds.get(normalizedLabel).add(song.label_id);
    }
  });
  
  // 第二次遍历：处理ID冲突和标记是否为重复厂牌
  const processedSongs = [];
  const labelNameToNextId = new Map();
  
  songs.forEach(song => {
    const normalizedLabel = normalizeLabelName(song.label_name);
    const isDuplicateLabel = labelNameToCount.get(normalizedLabel) > 1;
    
    // 初始化下一个可用ID
    if (!labelNameToNextId.has(normalizedLabel)) {
      const maxExistingId = Math.max(...Array.from(labelNameToIds.get(normalizedLabel) || [0]));
      labelNameToNextId.set(normalizedLabel, Math.max(maxExistingId, 1) + 1);
    }
    
    // 克隆歌曲对象并添加规范化的厂牌名称和重复标记
    const processedSong = { 
      ...song, 
      normalized_label: normalizedLabel,
      is_duplicate_label: isDuplicateLabel
    };
    
    // 如果ID不存在或为0，则分配新ID
    if (!song.label_id || song.label_id === 0) {
      processedSong.label_id = labelNameToNextId.get(normalizedLabel) - 1; // 从1开始编号
      labelNameToNextId.set(normalizedLabel, processedSong.label_id + 1);
    }
    
    processedSongs.push(processedSong);
  });
  
  return processedSongs;
}

// 处理同厂牌下歌曲编号冲突
function resolveSongNumberConflicts(songs) {
  // 按厂牌分组
  const songsByLabel = new Map();
  
  songs.forEach(song => {
    const labelKey = `${song.normalized_label}-${song.label_id}`;
    if (!songsByLabel.has(labelKey)) {
      songsByLabel.set(labelKey, []);
    }
    songsByLabel.get(labelKey).push(song);
  });
  
  // 处理每个厂牌下的歌曲编号
  const result = [];
  
  songsByLabel.forEach((labelSongs, labelKey) => {
    // 按原编号排序
    labelSongs.sort((a, b) => a.song_number - b.song_number);
    
    const usedNumbers = new Set();
    let nextAvailableNumber = 1;
    
    labelSongs.forEach(song => {
      let finalNumber = song.song_number;
      
      // 如果编号已存在或无效，则分配下一个可用编号
      if (!finalNumber || finalNumber < 1 || usedNumbers.has(finalNumber)) {
        while (usedNumbers.has(nextAvailableNumber)) {
          nextAvailableNumber++;
        }
        finalNumber = nextAvailableNumber;
        nextAvailableNumber++;
      }
      
      usedNumbers.add(finalNumber);
      result.push({ ...song, final_song_number: finalNumber });
    });
  });
  
  return result;
}

// 生成厂牌文件夹名称
function generateLabelFolderName(normalizedLabel, labelId, isDuplicateLabel) {
  // 只有在厂牌名重复时才添加ID后缀
  if (isDuplicateLabel && labelId > 1) {
    return `${normalizedLabel}-${labelId}`;
  }
  return normalizedLabel;
}

// 读取模板文件
function readTemplate() {
  try {
    return fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } catch (error) {
    console.error('读取模板文件失败:', error.message);
    process.exit(1);
  }
}

// 生成HTML内容
function generateHtmlContent(template, song) {
  // 构建封面图片路径
  const coverPath = `../../cover/${encodeURIComponent(song.cover)}`;
  
  // 构建脚本内容 - 使用优化后的脚本结构
  const newScriptContent = `  <script>
    // 歌曲信息配置对象
    const songConfig = {
      // 基本信息
      songName: "${song.song_title}", // 歌曲名称
      artistName: "${song.artist}",      // 艺人名称
      songSlug: "${song.final_song_number}", // URL友好的标识符
      // 封面图片路径
      coverImage: "${coverPath}",
      // 各平台链接
      platformLinks: {
        qqmusic: "${song.links.qqmusic || song.links.qq || '#'}",   // QQ音乐链接
        spotify: "${song.links.spotify || '#'}",   // Spotify链接
        netease: "${song.links.netease || '#'}",   // 网易云音乐链接
        applemusic: "${song.links.applemusic || song.links.apple || '#'}", // Apple Music链接
        soundcloud: "${song.links.soundcloud || '#'}"  // SoundCloud链接
      }
    };
  </script>`;

  // 替换脚本块 - 使用更精确的正则表达式匹配整个script标签
  let content = template.replace(/<script>[\s\S]*?const songConfig[\s\S]*?<\/script>/, newScriptContent);
  
  // 替换页面标题为"艺人名 - 歌曲名"格式 - 同时包含meta description
  content = content.replace(/<title>.*?<\/title>/, `<title>${song.artist} - ${song.song_title}</title>
  <meta name="description" content="${song.artist} - ${song.song_title} 音乐聚合页">`);
  
  // 移除不必要的Font Awesome引用（如果存在）
  content = content.replace(/<!-- Font Awesome -->\s*<link href="https:\/\/cdn.jsdelivr.net\/npm\/font-awesome@4.7.0\/css\/font-awesome.min.css" rel="stylesheet">/, '');
  
  return content;
}

// 优化并复制封面图片
function optimizeAndCopyCoverImages() {
  // 检查优化脚本是否存在
  if (fs.existsSync(OPTIMIZE_SCRIPT_PATH)) {
    try {
      console.log('开始优化封面图片...');
      // 使用子进程运行优化脚本，使用引号包裹路径以处理空格
      const result = execSync(`node "${OPTIMIZE_SCRIPT_PATH}"`, { encoding: 'utf8' });
      console.log(result);
      return true;
    } catch (error) {
      console.error('图片优化过程中出错:', error.stderr || error.message);
      console.log('将使用原始复制方法作为备用...');
      return false;
    }
  } else {
    console.log('图片优化脚本不存在，将使用原始复制方法');
    return false;
  }
}

// 复制封面图片到dist目录（可选）
function copyCoverImageIfNeeded(song) {
  const srcPath = path.join(COVER_DIR, song.cover);
  const destDir = path.join(DIST_DIR, 'cover');
  const destPath = path.join(destDir, song.cover);
  
  if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
    ensureDirectoryExists(destDir);
    fs.copyFileSync(srcPath, destPath);
    console.log(`复制封面图片: ${song.cover}`);
  }
}

// 生成单个Fanlink页面
function generateFanlinkPage(template, song) {
  const labelFolderName = generateLabelFolderName(song.normalized_label, song.label_id, song.is_duplicate_label);
  const targetDir = path.join(DIST_DIR, labelFolderName, song.final_song_number.toString());
  const targetFilePath = path.join(targetDir, 'index.html');
  
  // 确保目标目录存在
  ensureDirectoryExists(targetDir);
  
  // 生成HTML内容
  const htmlContent = generateHtmlContent(template, song);
  
  // 写入文件
  fs.writeFileSync(targetFilePath, htmlContent, 'utf8');
  
  // 可选：复制封面图片
  copyCoverImageIfNeeded(song);
  
  // 返回生成信息
  return {
    song_title: song.song_title,
    artist: song.artist,
    label: labelFolderName,
    song_number: song.final_song_number,
    url: `fan.lucetune.com/${labelFolderName}/${song.final_song_number}`,
    file_path: targetFilePath
  };
}

// 主生成函数
function generateFanlinks() {
  console.log('======================================');
  console.log('开始生成 Fanlink 页面...');
  
  // 读取数据
  const rawSongs = readSongsData();
  console.log(`读取到 ${rawSongs.length} 首歌曲数据`);
  
  // 处理冲突
  const songsWithResolvedLabelConflicts = resolveLabelConflicts(rawSongs);
  const songsWithResolvedConflicts = resolveSongNumberConflicts(songsWithResolvedLabelConflicts);
  
  // 确保dist目录存在
  ensureDirectoryExists(DIST_DIR);
  
  // 优化封面图片
  const optimized = optimizeAndCopyCoverImages();

  // 如果优化失败，回退到原始复制方法
  if (!optimized) {
    console.log('复制封面图片...');
    songsWithResolvedConflicts.forEach(song => {
      if (song.cover) {
        copyCoverImageIfNeeded(song);
      }
    });
  }
  
  // 读取模板
  const template = readTemplate();
  
  // 生成页面
  const generatedPages = [];
  songsWithResolvedConflicts.forEach(song => {
    const pageInfo = generateFanlinkPage(template, song);
    generatedPages.push(pageInfo);
  });
  
  // 显示生成结果
  console.log('======================================');
  console.log(`成功生成 ${generatedPages.length} 个 Fanlink 页面！`);
  console.log('======================================');
  
  generatedPages.forEach(page => {
    console.log(`歌曲: ${page.song_title} - ${page.artist}`);
    console.log(`厂牌: ${page.label}`);
    console.log(`编号: ${page.song_number}`);
    console.log(`URL: ${page.url}`);
    console.log(`文件: ${page.file_path}`);
    console.log('--------------------------------------');
  });
  
  console.log('提示: 修改 songs.json 后重新运行脚本以更新页面');
}

// 执行生成
generateFanlinks();