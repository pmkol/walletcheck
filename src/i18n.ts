export type Locale = 'en' | 'zh-CN' | 'zh-HK';
export type Translations = Record<string, readonly [english: string, traditional: string]>;

export function resolveLocale(value: string | null | undefined): Locale {
  return value === 'en' || value === 'zh-HK' ? value : 'zh-CN';
}

export function createTranslator(messages: Translations) {
  const pattern = new RegExp(Object.keys(messages).sort((first, second) => second.length - first.length)
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return (message: string, locale: Locale): string => locale === 'zh-CN' ? message
    : message.replace(pattern, (key) => messages[key][locale === 'en' ? 0 : 1]);
}

export function createLocalizer(root: ParentNode, translate: (text: string, locale: Locale) => string) {
  const texts: { node: Text; source: string }[] = [];
  const attributes: { element: Element; name: string; source: string }[] = [];
  for (const element of root.querySelectorAll('*')) {
    if (element.closest('script, style, pre, code')) continue;
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        texts.push({ node: node as Text, source: node.textContent });
      }
    }
    for (const name of ['aria-label', 'title', 'alt']) {
      const source = element.getAttribute(name);
      if (source) attributes.push({ element, name, source });
    }
  }
  return (locale: Locale) => {
    for (const { node, source } of texts) node.data = translate(source, locale);
    for (const { element, name, source } of attributes) element.setAttribute(name, translate(source, locale));
  };
}

export const translate = createTranslator({
  '钱包地址核对弹窗': ['Wallet verification dialog', '錢包地址核對彈窗'],
  'WalletCheck · 收款地址核对': ['WalletCheck · Address verification', 'WalletCheck · 收款地址核對'],
  '关闭核对弹窗': ['Close verification dialog', '關閉核對彈窗'],
  '关闭': ['Close', '關閉'],
  '已有钱包核对弹窗打开，请先完成或关闭。': ['A verification dialog is already open. Complete or close it first.', '已有錢包核對彈窗開啟，請先完成或關閉。'],
  '请在支持原生 Dialog 的浏览器页面加载后打开弹窗。': ['Open the dialog after the page loads in a browser supporting native Dialog.', '請在支援原生 Dialog 的瀏覽器頁面載入後開啟彈窗。'],
  '钱包地址核对': ['Wallet address verification', '錢包地址核對'],
  '核对收款地址': ['Verify wallet address', '核對收款地址'],
  '图片识别 · 本地处理 · 隐私优先': ['Image recognition · On-device · Private', '圖片辨識 · 本機處理 · 隱私優先'],
  '待核对币种和网络': ['Selected coin and network', '待核對幣種和網路'],
  '选择图片，也可以拖拽或粘贴图片': ['Choose, drop, or paste an image', '選擇圖片，也可以拖曳或貼上圖片'],
  '选择一张收款图片': ['Choose a payment screenshot', '選擇一張收款圖片'],
  '拖拽至此，或聚焦后粘贴图片': ['Drop here, or focus and paste an image', '拖曳至此，或聚焦後貼上圖片'],
  'PNG / JPEG / WebP · 最大 5 MB': ['PNG / JPEG / WebP · Up to 5 MB', 'PNG / JPEG / WebP · 最大 5 MB'],
  '待核对的收款图片': ['Payment screenshot to verify', '待核對的收款圖片'],
  '框选时保留币种、网络、完整地址及二维码': ['Keep the coin, network, full address, and QR code in the crop', '框選時保留幣種、網路、完整地址及 QR 碼'],
  '应用裁剪': ['Apply crop', '套用裁切'],
  '开始核对': ['Start verification', '開始核對'],
  '查看图片': ['View image', '查看圖片'],
  '收起图片': ['Collapse image', '收起圖片'],
  '清除图片': ['Clear image', '清除圖片'],
  '清除当前图片': ['Clear the current image', '清除目前圖片'],
  '重新核对': ['Start over', '重新核對'],
  '清空图片并开始新的核对': ['Clear the image and start a new verification', '清空圖片並開始新的核對'],
  '核对结果': ['Verification results', '核對結果'],
  '币种：': ['Coin:', '幣種：'],
  '网络：': ['Network:', '網路：'],
  '地址：': ['Address:', '地址：'],
  '确认钱包地址': ['Confirm wallet address', '確認錢包地址'],
  '请上传包含币种、网络、钱包地址和二维码的图片。': ['Upload an image containing the coin, network, wallet address, and QR code.', '請上傳包含幣種、網路、錢包地址和 QR 碼的圖片。'],
  '未设置币种': ['Coin not set', '未設定幣種'],
  '未设置有效网络': ['Network not set', '未設定有效網路'],
  '请由宿主设置有效的 network 属性。': ['Set a valid network attribute in the host application.', '請由宿主設定有效的 network 屬性。'],
  '图片已就绪。可直接核对，或先裁剪收款区域。': ['Image ready. Start verification or crop the payment area first.', '圖片已就緒。可直接核對，或先裁切收款區域。'],
  '正在框选收款区域，应用裁剪后需要重新核对。': ['Selecting the payment area. Applying the crop requires a new verification.', '正在框選收款區域，套用裁切後需要重新核對。'],
  '请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片。': ['Choose a PNG, JPEG, or WebP image up to 5 MB.', '請選擇不超過 5 MB 的 PNG、JPEG 或 WebP 圖片。'],
  '地址核对通过，请检查完整地址及币种、网络后确认。': ['Verification passed. Review the full address, coin, and network before confirming.', '地址核對通過，請檢查完整地址及幣種、網路後確認。'],
  '已确认，地址信息已交给宿主项目。': ['Confirmed. The address details have been returned to the host application.', '已確認，地址資訊已交給宿主專案。'],
  '核对通过': ['Passed', '核對通過'],
  '未识别到': ['Not detected', '未辨識到'],
  '不一致': ['Mismatch', '不一致'],
  '有歧义': ['Ambiguous', '有歧義'],
  '未通过核对': ['Not verified', '未通過核對'],
  '正在处理图片': ['Preparing image', '正在處理圖片'],
  '正在识别二维码': ['Reading QR codes', '正在辨識 QR 碼'],
  '正在加载本地文字识别引擎': ['Loading on-device OCR engine', '正在載入本機文字辨識引擎'],
  '正在识别地址、币种和网络': ['Reading address, coin, and network', '正在辨識地址、幣種和網路'],
  '没有识别到完整地址，请上传更清晰的图片。': ['No full address detected. Upload a clearer image.', '沒有辨識到完整地址，請上傳更清晰的圖片。'],
  '识别出的地址未通过格式或校验和检查，可能存在文字识别误差。请检查完整地址或换用清晰图片。': ['The address failed format or checksum validation. Check the full address or use a clearer image.', '辨識出的地址未通過格式或檢查碼驗證，可能存在文字辨識誤差。請檢查完整地址或換用清晰圖片。'],
  '二维码不是支持的地址格式。请使用纯地址二维码。': ['Unsupported QR address format. Use a QR code containing only the address.', 'QR 碼不是支援的地址格式。請使用純地址 QR 碼。'],
  '识别到的网络与当前配置不一致，请检查截图和所选网络。': ['The detected network does not match your selection. Check the screenshot and selected network.', '辨識到的網路與目前設定不一致，請檢查截圖和所選網路。'],
  '识别到的币种与当前配置不一致，请检查截图和所选币种。': ['The detected coin does not match your selection. Check the screenshot and selected coin.', '辨識到的幣種與目前設定不一致，請檢查截圖和所選幣種。'],
  '未识别到截图中的币种标识，请保留币种名称后重新核对。': ['Coin not detected. Include the coin name and try again.', '未辨識到截圖中的幣種標識，請保留幣種名稱後重新核對。'],
  '未识别到明确的网络名称，请保留网络信息后重新核对。': ['Network not detected. Include the network name and try again.', '未辨識到明確的網路名稱，請保留網路資訊後重新核對。'],
  '截图包含多个或有歧义的币种标识，无法确认。': ['Multiple or ambiguous coins detected. Confirmation is unavailable.', '截圖包含多個或有歧義的幣種標識，無法確認。'],
  '截图中的网络信息不唯一或有歧义，无法确认。': ['Multiple or ambiguous networks detected. Confirmation is unavailable.', '截圖中的網路資訊不唯一或有歧義，無法確認。'],
  '检测到多个不同地址，请裁剪到一个收款区域。': ['Multiple addresses detected. Crop to a single payment area.', '偵測到多個不同地址，請裁切到一個收款區域。'],
  '没有识别到二维码，双重核对不能通过。': ['No QR code detected. Both address sources are required.', '沒有辨識到 QR 碼，雙重核對不能通過。'],
  '没有识别到完整文字地址。请上传清晰原图，并保留完整地址及二维码。': ['No full text address detected. Upload a clear original image with the full address and QR code.', '沒有辨識到完整文字地址。請上傳清晰原圖，並保留完整地址及 QR 碼。'],
  '文字地址与二维码地址不一致，请勿确认。': ['The text address and QR address differ. Do not confirm.', '文字地址與 QR 碼地址不一致，請勿確認。'],
  '图片像素过大，请先在设备上缩小图片。': ['Image resolution is too high. Resize it on your device first.', '圖片像素過大，請先在裝置上縮小圖片。'],
  '浏览器不支持 Canvas': ['This browser does not support Canvas', '瀏覽器不支援 Canvas'],
  '裁剪失败，请重试': ['Cropping failed. Please try again', '裁切失敗，請重試'],
  '不支持的网络': ['Unsupported network', '不支援的網路'],
  '币种标识不合法': ['Invalid coin symbol', '幣種標識不合法'],
  '组件已销毁': ['The checker has been disposed', '元件已銷毀'],
  '请上传 PNG、JPEG 或 WebP 图片': ['Upload a PNG, JPEG, or WebP image', '請上傳 PNG、JPEG 或 WebP 圖片'],
  '图片不能为空，且不能超过 5 MB': ['The image must not be empty or exceed 5 MB', '圖片不能為空，且不能超過 5 MB'],
  '图片像素不能超过 2400 万，请先裁剪或缩小': ['Image resolution must not exceed 24 megapixels. Crop or resize it first', '圖片像素不能超過 2400 萬，請先裁切或縮小'],
  '二维码过多，请裁剪到一个收款区域': ['Too many QR codes. Crop to a single payment area', 'QR 碼過多，請裁切到一個收款區域'],
  '文字识别引擎初始化失败。请运行 npm run assets:ocr 更新整套引擎和模型，并检查浏览器扩展是否拦截资源。': ['OCR initialization failed. Run npm run assets:ocr to update the engine and model, and check whether browser extensions are blocking resources.', '文字辨識引擎初始化失敗。請執行 npm run assets:ocr 更新整套引擎和模型，並檢查瀏覽器擴充功能是否攔截資源。'],
  '文字识别引擎错误：': ['OCR engine error: ', '文字辨識引擎錯誤：'],
  '文字识别超时，请检查模型部署或缩小图片后重试。': ['OCR timed out. Check model deployment or resize the image and try again.', '文字辨識逾時，請檢查模型部署或縮小圖片後重試。'],
  '请运行 npm run assets:ocr，检查 asset-base-url 和静态资源部署后重试。': ['Run npm run assets:ocr, check asset-base-url and static resource deployment, then retry.', '請執行 npm run assets:ocr，檢查 asset-base-url 和靜態資源部署後重試。'],
  '文字识别模型格式不正确。': ['Invalid OCR model format. ', '文字辨識模型格式不正確。'],
  '文字识别模型格式不正确或文件不完整。': ['Invalid or incomplete OCR model. ', '文字辨識模型格式不正確或檔案不完整。'],
  '文字识别模型编码损坏。': ['Corrupted OCR model encoding. ', '文字辨識模型編碼損壞。'],
  '文字识别模型完整性校验失败，资源可能损坏或被拦截。': ['OCR model integrity check failed. Resources may be corrupted or blocked. ', '文字辨識模型完整性驗證失敗，資源可能損壞或被攔截。'],
  '文字识别模型请求失败，请检查网络或下载器/浏览器扩展是否拦截资源。': ['OCR model request failed. Check your connection and download manager or browser extensions. ', '文字辨識模型請求失敗，請檢查網路或下載器／瀏覽器擴充功能是否攔截資源。'],
  '文字识别模型加载失败（HTTP ': ['OCR model failed to load (HTTP ', '文字辨識模型載入失敗（HTTP '],
  '文字识别模型被配置为附件下载，请移除 Content-Disposition: attachment。': ['The OCR model is served as a download. Remove Content-Disposition: attachment. ', '文字辨識模型被設定為附件下載，請移除 Content-Disposition: attachment。'],
  '文字识别模型响应不是 JSON，可能返回了网页或被拦截。': ['The OCR model response is not JSON. A web page may have been returned or the request blocked. ', '文字辨識模型回應不是 JSON，可能回傳了網頁或被攔截。'],
  '文字识别模型 JSON 不完整或已损坏。': ['The OCR model JSON is incomplete or corrupted. ', '文字辨識模型 JSON 不完整或已損壞。'],
});
