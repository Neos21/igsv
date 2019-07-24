# igsv : @neos21/igsv

Instagram の画像・動画をダウンロードする CLI ツール。

[![NPM Version](https://img.shields.io/npm/v/@neos21/igsv.svg)](https://www.npmjs.com/package/@neos21/igsv)


## Installation

```sh
$ npm install -g @neos21/igsv
```


## How To Use

```sh
# 指定の投稿に紐付く画像・動画を取得する
$ igsv https://www.instagram.com/p/XXXXXXXXXXX/
```

デフォルトの保存先は、コマンドを実行した時のカレントディレクトリに `igsv-downloads/` ディレクトリを作り、その下にファイルを保存する。

保存先ディレクトリを変更する場合は、環境変数か第2引数で指定できる (両方指定されている場合は第2引数が優先)。

```sh
# 環境変数で指定して実行
$ export IGSV_SAVE_DIRECTORY='/home/downloads'
$ igsv https://www.instagram.com/p/XXXXXXXXXXX/

# 第2引数で指定して実行
$ igsv https://www.instagram.com/p/XXXXXXXXXXX/ '/home/downloads'
```


## Author

[Neo](http://neo.s21.xrea.com/) ([@Neos21](https://twitter.com/Neos21))

- [GitHub - igsv](https://github.com/Neos21/igsv)
- [npm - @neos21/igsv](https://www.npmjs.com/package/@neos21/igsv)


## Links

- [Neo's World](http://neo.s21.xrea.com/)
- [Corredor](http://neos21.hatenablog.com/)
- [Murga](http://neos21.hatenablog.jp/)
- [El Mylar](http://neos21.hateblo.jp/)
- [Neo's GitHub Pages](https://neos21.github.io/)
- [GitHub - Neos21](https://github.com/Neos21/)
