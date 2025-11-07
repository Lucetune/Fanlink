const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 图片目录配置
const SOURCE_COVER_DIR = path.join(__dirname, 'cover');
const DEST_COVER_DIR = path.join(__dirname, 'artist', 'cover');

// 支持的图片格式
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

console.log('======================================');
console.log('开始优化图片...');
console.log('======================================');

// 检查是否安装了sharp库
function checkDependencies() {
    try {
        require('sharp');
        return true;
    } catch (e) {
        return false;
    }
}

// 安装依赖
function installDependencies() {
    console.log('安装图片优化依赖...');
    try {
        execSync('npm install sharp --save-dev', { stdio: 'inherit' });
        console.log('依赖安装成功！');
        return true;
    } catch (error) {
        console.error('依赖安装失败，尝试使用备用方法...');
        return false;
    }
}

// 使用sharp优化单个图片
function optimizeImageWithSharp(imagePath, outputPath) {
    const sharp = require('sharp');
    
    // 获取原始文件大小
    const originalSize = fs.statSync(imagePath).size;
    
    // 优化参数
    const MAX_WIDTH = 1200; // 最大宽度
    const QUALITY = 80;     // 质量设置（1-100）
    
    return sharp(imagePath)
        .resize({ width: MAX_WIDTH, fit: 'inside' })
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toFile(outputPath)
        .then(info => {
            const newSize = fs.statSync(outputPath).size;
            const savedPercent = ((originalSize - newSize) / originalSize * 100).toFixed(1);
            console.log(`优化 ${path.basename(imagePath)}:`);
            console.log(`  原始大小: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  优化大小: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  节省空间: ${savedPercent}%`);
            return info;
        })
        .catch(error => {
            console.error(`优化 ${path.basename(imagePath)} 失败:`, error.message);
            // 复制原始文件作为备用
            fs.copyFileSync(imagePath, outputPath);
            console.log('  已复制原始文件作为备用');
            return null;
        });
}

// 复制文件（备用方法）
function copyFile(source, target) {
    const originalSize = fs.statSync(source).size;
    fs.copyFileSync(source, target);
    console.log(`复制 ${path.basename(source)} (${(originalSize / 1024 / 1024).toFixed(2)} MB)`);
}

// 复制封面图片（与generate-fanlinks.js兼容的备用方法）
function copyCoverImageIfNeeded(song) {
    if (!song || !song.cover) return;
    
    const coverName = song.cover;
    const sourceCoverPath = path.join(SOURCE_COVER_DIR, coverName);
    const destCoverPath = path.join(DEST_COVER_DIR, coverName);

    // 确保目标目录存在
    if (!fs.existsSync(DEST_COVER_DIR)) {
        fs.mkdirSync(DEST_COVER_DIR, { recursive: true });
    }

    // 检查文件是否存在且最新
    if (!fs.existsSync(destCoverPath) ||
        fs.statSync(sourceCoverPath).mtimeMs > fs.statSync(destCoverPath).mtimeMs) {
        try {
            fs.copyFileSync(sourceCoverPath, destCoverPath);
            console.log(`封面图片已更新: ${coverName}`);
        } catch (error) {
            console.error(`复制封面图片失败: ${coverName}`, error);
        }
    }
}

// 主优化函数
async function optimizeImages() {
    // 确保目标目录存在
    if (!fs.existsSync(DEST_COVER_DIR)) {
        fs.mkdirSync(DEST_COVER_DIR, { recursive: true });
    }
    
    // 获取源目录中的所有图片
    const files = fs.readdirSync(SOURCE_COVER_DIR)
        .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()));
    
    if (files.length === 0) {
        console.log('没有找到需要优化的图片文件');
        return;
    }
    
    console.log(`找到 ${files.length} 个图片文件`);
    
    // 检查并安装依赖
    let useSharp = false;
    if (!checkDependencies()) {
        useSharp = installDependencies();
    } else {
        useSharp = true;
    }
    
    let totalOriginalSize = 0;
    let totalNewSize = 0;
    
    // 处理每个图片
    for (const file of files) {
        const sourcePath = path.join(SOURCE_COVER_DIR, file);
        const outputPath = path.join(DEST_COVER_DIR, file);
        
        console.log(`\n处理: ${file}`);
        
        if (useSharp) {
            await optimizeImageWithSharp(sourcePath, outputPath);
        } else {
            copyFile(sourcePath, outputPath);
        }
        
        // 计算统计信息
        totalOriginalSize += fs.statSync(sourcePath).size;
        totalNewSize += fs.statSync(outputPath).size;
    }
    
    // 输出总体统计
    console.log('\n======================================');
    console.log('图片优化完成！');
    console.log(`总原始大小: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`总优化大小: ${(totalNewSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`总节省空间: ${((totalOriginalSize - totalNewSize) / totalOriginalSize * 100).toFixed(1)}%`);
    console.log('======================================');
    
    // 提示用户运行生成脚本
    console.log('\n请运行 `node generate-fanlinks.js` 来应用优化后的图片');
}

// 运行优化
optimizeImages().catch(error => {
    console.error('优化过程中出错:', error);
});