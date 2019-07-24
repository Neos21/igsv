#!/usr/bin/env node

/*! 引数で指定された Instagram URL よりツイートに紐付く画像・動画を特定してダウンロードする */

const fs    = require('fs');
const http  = require('http');
const https = require('https');
const path  = require('path');
const util  = require('util');

const fsWriteFile = util.promisify(fs.writeFile);

const requestPromise = require('request-promise');
const cheerio = require('cheerio');



// メイン処理
// ====================================================================================================

(async () => {
  // URL : 第1引数で指定する
  const url = detectUrl();
  // 保存先ディレクトリ : 第2引数・環境変数・デフォルトパスを特定する
  const { saveDirectoryPath, isDefaultSaveDirectory } = detectSaveDirectory();
  
  // ページの HTML (jQuery-Like オブジェクト) を取得する
  let $ = null;
  try {
    $ = await fetchPage(url);
  }
  catch(error) {
    console.error('指定の URL を取得できなかった', url);
    // console.error(error);
    return process.exit(1);
  }
  
  // HTML から投稿データが格納されている JSON 部分を抜き出す
  let json = null;
  try {
    json = exactData($);
  }
  catch(error) {
    console.error('投稿データを取得できなかった', error);
    return process.exit(1);
  }
  
  // JSON から画像・動画 URL を取得する
  const mediaUrls = collectMediaUrls(json);
  
  // ダウンロードできるメディアがない場合は中止する
  if(!mediaUrls.length) {
    console.error('画像・動画の URL が見つからなかった');
    return process.exit(1);
  }
  
  // デフォルトパスの場合、保存先ディレクトリがなければ作成する
  if(isDefaultSaveDirectory) {
    try {
      createSaveDirectory(saveDirectoryPath);
    }
    catch(error) {
      console.error('保存先ディレクトリの作成に失敗', error);
      return process.exit(1);
    }
  }
  
  // ダウンロード処理
  await Promise.all(mediaUrls.map((mediaUrl) => {
    return downloadFile(mediaUrl, saveDirectoryPath);
  }));
  
  console.log('完了');
})();

// ====================================================================================================



/**
 * URL 文字列を取得する
 * 
 * @return {string} URL
 * @throws 引数がない・URL 不正の場合はプロセスを終了する
 */
function detectUrl() {
  const url = process.argv[2];
  if(!url) {
    console.error('引数で Instagram URL を指定してください');
    return process.exit(1);
  }
  else if(!isInstagramUrl(url)) {
    console.error('指定された URL が不正です', url);
    return process.exit(1);
  }
  return url;
}


/**
 * 保存先ディレクトリを特定する
 * 
 * @return {*} 保存先ディレクトリパスと、そのパスがデフォルト値かどうかを返す
 */
function detectSaveDirectory() {
  // 保存先ディレクトリパス : 呼び出し元のカレントディレクトリ配下にディレクトリを作成し保存する
  let saveDirectoryPath = path.join(process.cwd(), 'igsv-downloads');
  // 上のデフォルトのディレクトリパスに保存するかどうか
  let isDefaultSaveDirectory = true;
  
  // 環境変数があればそのディレクトリパスに保存する
  if(process.env['IGSV_SAVE_DIRECTORY']) {
    saveDirectoryPath = process.env['IGSV_SAVE_DIRECTORY'];
    isDefaultSaveDirectory = false;
  }
  
  // 第2引数があればそのディレクトリパスに保存する
  if(process.argv[3]) {
    saveDirectoryPath = process.argv[3];
    isDefaultSaveDirectory = false;
  }
  
  // 特定したディレクトリパスを検証する
  if(isDefaultSaveDirectory) {
    if(!canMakeSaveDirectory(saveDirectoryPath)) {
      // デフォルトパスの場合、ディレクトリが作成できそうか確認する (既にディレクトリが存在している分には問題なし)
      console.error('保存先にファイルが存在するためディレクトリが作成できない', saveDirectoryPath);
      return process.exit(1);
    }
  }
  else if(!existsDirectory(saveDirectoryPath)) {
    // パスが指定されている場合、ディレクトリが既に存在しているか確認する
    console.error('保存先ディレクトリが存在しない', saveDirectoryPath);
    return process.exit(1);
  }
  
  return { saveDirectoryPath, isDefaultSaveDirectory };
}



/**
 * 保存先ディレクトリが作成できるか確認する
 * 
 * @param {string} saveDirectoryPath 保存先ディレクトリパス
 * @return 何も存在していないか、ディレクトリが既に存在する場合は true・ファイルが存在している場合は作成できないので false
 */
function canMakeSaveDirectory(saveDirectoryPath) {
  return !fs.existsSync(saveDirectoryPath) || fs.statSync(saveDirectoryPath).isDirectory();
}

/**
 * 保存先ディレクトリが存在するか確認する
 * 
 * @param {string} saveDirectoryPath 保存先ディレクトリパス
 * @return ディレクトリが存在すれば true・存在しなければ false
 */
function existsDirectory(saveDirectoryPath) {
  return fs.existsSync(saveDirectoryPath) && fs.statSync(saveDirectoryPath).isDirectory();
}

/**
 * 保存先ディレクトリがない場合は作成する
 * (保存先ディレクトリパスに何かが存在する場合、それがファイルかディレクトリかは canMakeSaveDirectory() で確認済)
 * 
 * @param {string} saveDirectoryPath 保存先ディレクトリパス
 * @throws ディレクトリが作成出来ない場合は fs.mkdirSync() で例外が発生する
 */
function createSaveDirectory(saveDirectoryPath) {
  if(!fs.existsSync(saveDirectoryPath)) {
    console.log(`${saveDirectoryPath} ディレクトリ未作成`);
    fs.mkdirSync(saveDirectoryPath);
  }
}



/**
 * Instagram の有効な URL かどうか判定する
 * 
 * @param {string} url URL
 * @return {boolean} Instagram の有効な URL なら true・そうでなければ false
 */
function isInstagramUrl(url) {
  // 'instagram.com/p/' か 'instagram.com/tv/' を含む URL 文字列なら OK とする
  return url.match(/instagram.com\/(p|tv)\//u);
}



/**
 * 投稿ページを取得する
 * 
 * @param {string} url URL
 * @return {Promise<*>} jQuery-Like オブジェクト
 * @throws 通信に失敗した場合
 */
function fetchPage(url) {
  return requestPromise.get({
    url: url,
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36'
    },
    transform: (rawHtml) => {
      return cheerio.load(rawHtml);
    }
  });
}

/**
 * 投稿ページの HTML (jQuery-Like オブジェクト) から投稿データの JSON を取得する
 * 
 * @param {*} $ jQuery-Like オブジェクト
 * @return {*} 投稿データの JSON オブジェクト
 * @throws 投稿データを特定しきれなかった場合、JSON パースに失敗した場合
 */
function exactData($) {
  let jsonStr = '';
  $('script').each((_index, element) => {
    const innerHtml = $(element).html();
    // 'window._sharedData' 変数が投稿データを持っている
    if(innerHtml.match(/window\._sharedData\s?=/u)) {
      // 変数への代入の形になっているので、代入するオブジェクト部分のみ抽出する
      jsonStr = innerHtml.match(/window\._sharedData\s?=\s?(.*);$/u)[1];
    }
  });
  
  if(!jsonStr) {
    throw new Error('投稿データの JSON が見つからなかった');
  }
  
  // パースに失敗した場合は例外がスローされる
  const rawJson = JSON.parse(jsonStr);
  
  // プロパティの存在を調べて必要なプロパティの階層のみ返す
  if(rawJson.entry_data
     && rawJson.entry_data.PostPage
     && rawJson.entry_data.PostPage.length >= 1
     && rawJson.entry_data.PostPage[0]
     && rawJson.entry_data.PostPage[0].graphql
     && rawJson.entry_data.PostPage[0].graphql.shortcode_media
  ) {
    return rawJson.entry_data.PostPage[0].graphql.shortcode_media;
  }
  else {
    throw new Error('投稿データを抽出できなかった');
  }
}



/**
 * 投稿データから画像・動画の直 URL を取得する
 * 
 * @param {*} json 投稿データの JSON オブジェクト
 * @param {Array<string>} 直 URL リスト・メディアがない場合は空配列
 */
function collectMediaUrls(json) {
  const mediaUrls = [];
  if(json.edge_sidecar_to_children && json.edge_sidecar_to_children.edges) {
    // 複数投稿 (画像のみ複数・動画のみ複数・画像と動画混在)
    json.edge_sidecar_to_children.edges
      .map((item) => {
        return item.node || {};
      })
      .forEach((node) => {
        if(node.video_url) {
          // 動画 : 判定は node.is_video プロパティで見ても良い
          mediaUrls.push(node.video_url);
        }
        else {
          // 画像 : 最高画質を取得する
          const imageUrl = detectHighestQualityImageUrl(node.display_resources || []);
          if(imageUrl) {
            mediaUrls.push(imageUrl);
          }
        }
    });
  }
  else if(json.video_url) {
    // 動画単独 : IGTV 含む・判定は json.is_video プロパティで見ても良い
    mediaUrls.push(json.video_url);
  }
  else {
    // 画像単独 : 最高画質を取得する
    const imageUrl = detectHighestQualityImageUrl(json.display_resources || []);
    if(imageUrl) {
      mediaUrls.push(imageUrl);
    }
  }
  
  return mediaUrls;
}

/**
 * リソース一覧から最高画質の画像 URL を特定する
 * @param {Array<*>} resources リソース情報の配列
 */
function detectHighestQualityImageUrl(resources) {
  let currentUrl = '';
  let currentWidth = -1;
  resources.forEach((resource) => {
    if(!resource.src || resource.config_width === undefined) {
      return;
    }
    
    if(resource.config_width >= currentWidth) {
      currentUrl   = resource.src;
      currentWidth = resource.config_width;
    }
  });
  return currentUrl;
}



/**
 * 同時接続数を制御するエージェント
 */
class SocketsAgent {
  /**
   * コンストラクタ
   * 
   * @param {number} maxSockets 最大同時接続数
   */
  constructor(maxSockets) {
    this.http = new http.Agent();
    this.https = new https.Agent();
    this.http.maxSockets = maxSockets;
    this.https.maxSockets = maxSockets;
  }
  
  /**
   * ソケットを取得する
   * 
   * @param {string} url URL
   * @return {*} http or https
   */
  get(url) {
    if(url.includes('https://')) {
      return this.https;
    }
    else if(url.includes('http://')) {
      return this.http;
    }
  }
}

// 同時接続数を制御する
const socketsAgent = new SocketsAgent(5);

/**
 * 画像・動画ファイルをダウンロードする
 * ファイル取得・保存に失敗した場合はログ出力のみで終了する
 * 
 * @param {string} mediaUrl 画像・動画の URL
 * @param {string} saveDirectoryPath 保存先ディレクトリパス
 * @return {Promise<null>} ダウンロード完了
 */
function downloadFile(mediaUrl, saveDirectoryPath) {
  const savePath = path.join(saveDirectoryPath, path.basename(mediaUrl).replace(/\?.*/u, ''));
  console.log('ダウンロード開始', mediaUrl, savePath);
  return requestPromise.get({
    url: mediaUrl,
    encoding: null,
    timeout: 15000,
    headers: {
      // Windows Chrome の UA に偽装しておく
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36'
    },
    pool: socketsAgent.get(mediaUrl)
  })
    .then((binary) => {
      console.log('ダウンロード成功', mediaUrl, savePath);
      return fsWriteFile(savePath, binary, 'binary');
    })
    .then(() => {
      console.log('ファイル保存成功', mediaUrl, savePath);
    })
    .catch((_error) => {
      console.error('ダウンロード失敗', mediaUrl, savePath);
    });
}
