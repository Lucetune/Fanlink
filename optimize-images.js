const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 图片目录配置
const SOURCE_COVER_DIR = path.join(__dirname, 'cover');
const DEST_COVER_DIR = path.join(__dirname, 'artist', 'cover');

// 艺人头像目录（新增）
const ARTIST_IMAGES_DIR = path.join(__dirname, 'artist', 'reian', 'images');

// 获取命令行参数指定的目录（如果有）
const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : null;

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

// 使用sharp优化单个图片（改进版）
async function optimizeImageWithSharp(imagePath, outputPath) {
    const sharp = require('sharp');
    
    try {
        const file = path.basename(imagePath);
        const fileExt = path.extname(imagePath).toLowerCase();
        
        // 获取原始文件大小
        const originalSize = fs.statSync(imagePath).size;
        
        // 读取原始文件内容到内存
        const imageBuffer = await fs.promises.readFile(imagePath);
        
        // 使用buffer创建sharp实例
        let image = sharp(imageBuffer);
        
        // 获取图片信息
        const info = await image.metadata();
        
        // 优化参数
        const MAX_WIDTH = 1200; // 最大宽度
        const QUALITY = 80;     // 质量设置（1-100）
        
        // 基础优化配置
        image = image.resize({ width: MAX_WIDTH, fit: 'inside', withoutEnlargement: true });
        
        // 根据文件类型设置不同的优化参数
        if (fileExt === '.jpg' || fileExt === '.jpeg') {
            image = image.jpeg({ quality: QUALITY, mozjpeg: true });
        } else if (fileExt === '.png') {
            image = image.png({ quality: QUALITY, compressionLevel: 9 });
        } else if (fileExt === '.webp') {
            image = image.webp({ quality: QUALITY });
        }
        
        // 生成优化后的buffer而不是直接写入文件
        const optimizedBuffer = await image.toBuffer();
        
        // 计算新大小
        const newSize = optimizedBuffer.length;
        const savedPercent = ((originalSize - newSize) / originalSize * 100).toFixed(1);
        
        console.log(`优化 ${file}:`);
        console.log(`  原始大小: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  优化大小: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  节省空间: ${savedPercent}%`);
        
        // 写入优化后的文件
        await fs.promises.writeFile(outputPath, optimizedBuffer);
        
        return { size: newSize };
        
    } catch (error) {
        console.error(`优化 ${path.basename(imagePath)} 失败:`, error.message);
        // 出错时不尝试复制，避免文件锁定问题
        return null;
    }
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

// 优化单个文件函数（新增）
async function processSingleFile(filePath, useSharp) {
    const file = path.basename(filePath);
    const dir = path.dirname(filePath);
    const outputPath = path.join(dir, `temp_${file}`); // 使用临时文件
    
    console.log(`\n处理: ${file}`);
    
    // 获取原始文件大小
    const originalSize = fs.statSync(filePath).size;
    let newSize = originalSize; // 默认保持原始大小
    
    try {
        if (useSharp) {
            // 先优化到临时文件
            await optimizeImageWithSharp(filePath, outputPath);
            
            // 读取临时文件内容
            const optimizedContent = await fs.promises.readFile(outputPath);
            
            // 写入原始文件（覆盖）
            await fs.promises.writeFile(filePath, optimizedContent);
            
            // 删除临时文件
            await fs.promises.unlink(outputPath);
            
            // 更新新大小
            newSize = fs.statSync(filePath).size;
        } else {
            // 对于原地优化，复制操作没有意义，直接记录大小
            console.log(`  ${file} (${(originalSize / 1024 / 1024).toFixed(2)} MB) - 无法优化，保留原始文件`);
        }
    } catch (error) {
        console.error(`  处理 ${file} 时出错: ${error.message}`);
        // 清理临时文件（如果存在）
        if (fs.existsSync(outputPath)) {
            try {
                fs.unlinkSync(outputPath);
            } catch (unlinkError) {
                console.error(`  无法删除临时文件: ${unlinkError.message}`);
            }
        }
    }
    
    // 返回文件大小信息
    return {
        originalSize,
        newSize
    };
}

// 处理艺人头像目录（新增）
async function processArtistImages(artistImagesDir, useSharp) {
    console.log(`\n开始处理艺人头像目录: ${artistImagesDir}`);
    
    // 确保目录存在
    if (!fs.existsSync(artistImagesDir)) {
        console.log(`  目录不存在: ${artistImagesDir}`);
        return { totalOriginalSize: 0, totalNewSize: 0, processedCount: 0 };
    }
    
    // 获取目录中的所有图片
    const files = fs.readdirSync(artistImagesDir)
        .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()));
    
    if (files.length === 0) {
        console.log('  没有找到需要优化的图片文件');
        return { totalOriginalSize: 0, totalNewSize: 0, processedCount: 0 };
    }
    
    console.log(`  找到 ${files.length} 个图片文件`);
    
    let totalOriginalSize = 0;
    let totalNewSize = 0;
    
    // 处理每个图片（原地优化）
    for (const file of files) {
        const filePath = path.join(artistImagesDir, file);
        const result = await processSingleFile(filePath, useSharp);
        totalOriginalSize += result.originalSize;
        totalNewSize += result.newSize;
    }
    
    return { totalOriginalSize, totalNewSize, processedCount: files.length };
}

// 主优化函数
async function optimizeImages() {
    // 检查是否指定了目标目录
    if (targetDir) {
        console.log(`优化指定目录/文件: ${targetDir}`);
        
        // 检查目标是否为目录
        if (fs.existsSync(targetDir)) {
            const stats = fs.statSync(targetDir);
            
            // 检查并安装依赖
            let useSharp = false;
            if (!checkDependencies()) {
                useSharp = installDependencies();
            } else {
                useSharp = true;
            }
            
            if (stats.isDirectory()) {
                // 如果是艺人头像目录，使用特殊处理
                if (targetDir.includes('artist') && targetDir.includes('images')) {
                    const result = await processArtistImages(targetDir, useSharp);
                    
                    // 输出统计信息
                    if (result.processedCount > 0) {
                        console.log('\n======================================');
                        console.log(`艺人头像图片优化完成！`);
                        console.log(`总原始大小: ${(result.totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
                        console.log(`总优化大小: ${(result.totalNewSize / 1024 / 1024).toFixed(2)} MB`);
                        console.log(`总节省空间: ${((result.totalOriginalSize - result.totalNewSize) / result.totalOriginalSize * 100).toFixed(1)}%`);
                        console.log('======================================');
                    }
                } else {
                    // 处理普通目录
                    console.log(`开始处理目录: ${targetDir}`);
                    
                    // 获取目录中的所有图片
                    const files = fs.readdirSync(targetDir)
                        .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()));
                    
                    if (files.length === 0) {
                        console.log('没有找到需要优化的图片文件');
                        return;
                    }
                    
                    console.log(`找到 ${files.length} 个图片文件`);
                    
                    let totalOriginalSize = 0;
                    let totalNewSize = 0;
                    
                    // 处理每个图片（原地优化）
                    for (const file of files) {
                        const filePath = path.join(targetDir, file);
                        const result = await processSingleFile(filePath, useSharp);
                        totalOriginalSize += result.originalSize;
                        totalNewSize += result.newSize;
                    }
                    
                    // 输出统计信息
                    console.log('\n======================================');
                    console.log('图片优化完成！');
                    console.log(`总原始大小: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`总优化大小: ${(totalNewSize / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`总节省空间: ${((totalOriginalSize - totalNewSize) / totalOriginalSize * 100).toFixed(1)}%`);
                    console.log('======================================');
                }
            } else if (stats.isFile() && IMAGE_EXTENSIONS.includes(path.extname(targetDir).toLowerCase())) {
                // 处理单个文件
                let useSharp = false;
                if (!checkDependencies()) {
                    useSharp = installDependencies();
                } else {
                    useSharp = true;
                }
                
                await processSingleFile(targetDir, useSharp);
            } else {
                console.log('指定的路径不是有效的图片文件或目录');
            }
            
            return;
        } else {
            console.log(`路径不存在: ${targetDir}`);
            return;
        }
    }
    
    // 原有逻辑 - 处理封面图片
    console.log('处理封面图片目录...');
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
        
        // 检查文件是否已存在且未修改
        const sourceStats = fs.statSync(sourcePath);
        if (fs.existsSync(outputPath)) {
            const destStats = fs.statSync(outputPath);
            // 简单的缓存机制：如果目标文件已存在且源文件未修改，则跳过优化
            if (sourceStats.mtimeMs <= destStats.mtimeMs) {
                console.log(`  ${file} 已优化且未修改，跳过`);
                // 仍然统计文件大小
                totalOriginalSize += sourceStats.size;
                totalNewSize += destStats.size;
                continue;
            }
        }
        
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