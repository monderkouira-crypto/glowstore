import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ArrowLeft, ArrowUpRight, Building2, Check, Eye, EyeOff, Home, Instagram, MapPin, MessageCircle, Minus, PackageCheck, Pencil, Plus, Search, ShoppingBag, Trash2, Truck, X } from 'lucide-react';
import { getListOrdersQueryKey, getListProductsQueryKey, useCreateOrder, useCreateProduct, useDeleteProduct, useListOrders, useListProducts, useUpdateProduct } from '@workspace/api-client-react';
import type { Order, OrderInput, Product, ProductInput } from '@workspace/api-client-react';
import { useUpload } from '@workspace/object-storage-web';

type CartItem = Product & { quantity: number };
type ShippingRate = { visible: boolean; home: number; office: number };
type StoreSettings = { promotion: string; shipping: string; instagram: string; whatsapp: string; shippingRates: Record<string, ShippingRate> };

const wilayas = ['أدرار','الشلف','الأغواط','أم البواقي','باتنة','بجاية','بسكرة','بشار','البليدة','البويرة','تمنراست','تبسة','تلمسان','تيارت','تيزي وزو','الجزائر','الجلفة','جيجل','سطيف','سعيدة','سكيكدة','سيدي بلعباس','عنابة','قالمة','قسنطينة','المدية','مستغانم','المسيلة','معسكر','ورقلة','وهران','البيض','إليزي','برج بوعريريج','بومرداس','الطارف','تندوف','تيسمسيلت','الوادي','خنشلة','سوق أهراس','تيبازة','ميلة','عين الدفلى','النعامة','عين تموشنت','غليزان','غرداية','تيميمون','برج باجي مختار','أولاد جلال','بني عباس','عين صالح','عين قزام','تقرت','جانت','المغير','المنيعة','آفلو','بريكة','القنطرة','بئر العاتر','قصر الشلالة','عين وسارة','مسعد','قصر البخاري','العريشة','الأبيض سيدي الشيخ','تلاغ'];
const money = (n: number) => `${n.toLocaleString('fr-FR')} دج`;
const load = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const defaultSettings: StoreSettings = { promotion: 'شحن مجاني للطلبات فوق 12,000 دج', shipping: 'توصيل إلى 69 ولاية — الدفع عند الاستلام', instagram: '@glow_str_dz', whatsapp: '213550000000', shippingRates: Object.fromEntries(wilayas.map(name => [name, { visible: true, home: 700, office: 500 }])) as Record<string, ShippingRate> };
const getSettings = (): StoreSettings => { const stored = load<Partial<StoreSettings>>('glowstore-settings', {}); return { ...defaultSettings, ...stored, shippingRates: { ...defaultSettings.shippingRates, ...(stored.shippingRates || {}) } }; };
const getDeviceId = () => { const current = localStorage.getItem('glowstore-device-id'); if (current) return current; const next = `gs-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`; localStorage.setItem('glowstore-device-id', next); return next; };
const starPositions = Array.from({ length: 120 }, (_, index) => [
  (index * 43 + 11) % 97,
  (index * 67 + 13) % 97,
  index % 10 === 0 ? 2 : 1,
] as const);
const apiErrorMessage = (error: unknown) => {
  const candidate = error as { data?: { error?: string; retryAfterHours?: number }; message?: string };
  if (candidate?.data?.error) return `${candidate.data.error}${candidate.data.retryAfterHours ? ` يمكنك المحاولة بعد ${candidate.data.retryAfterHours} ساعة.` : ''}`;
  return candidate?.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
};
const imageUrl = (image: string | null | undefined) => {
  if (!image) return '';
  if (image.startsWith('/api/storage/')) return image;
  if (image.startsWith('/objects/')) return `/api/storage${image}`;
  return image;
};

function ProductVisual({ product, small = false }: { product: Product; small?: boolean }) {
  return <div className={`product-art art-${product.id}${small ? ' cart-thumb' : ''}`} aria-label={`صورة ${product.name}`} data-testid={`img-product-${product.id}`}>
    {product.image ? <img className="product-image" src={imageUrl(product.image)} alt={product.name} /> : <div className={`fixture ${product.art}`} />}
    {!small && <span className="orb-label mono">GS / {String(product.id).padStart(2, '0')}</span>}
  </div>;
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (product: Product) => void }) {
  const available = product.stock > 0;
  return <article className="product-card reveal" data-testid={`card-product-${product.id}`}>
    <ProductVisual product={product} />
    <div className="product-info">
      <div className="product-meta"><span data-testid={`text-category-${product.id}`}>{product.category}</span><span data-testid={`status-stock-${product.id}`}><i className="stock-dot" /> {product.stockVisible === false ? 'متوفر' : available ? `متوفر · ${product.stock}` : 'نفد'}</span></div>
      <h3 className="product-name" data-testid={`text-product-name-${product.id}`}>{product.name}</h3>
      <p className="product-description" data-testid={`text-product-description-${product.id}`}>{product.description}</p>
      {product.promotion && <span className="promo-chip" data-testid={`text-promotion-${product.id}`}>{product.promotion}</span>}
      <div className="product-bottom"><span className="price" data-testid={`text-price-${product.id}`}><small>السعر</small>{product.priceVisible === false ? 'عند الطلب' : money(product.price)}</span><button className="product-order" type="button" disabled={!available} onClick={() => onAdd(product)} data-testid={`button-add-product-${product.id}`} aria-label={`اطلب ${product.name} الآن`}><Plus size={16} /> اطلب الآن</button></div>
    </div>
  </article>;
}

function OrderModal({ items, settings, onClose, onSuccess }: { items: CartItem[]; settings: StoreSettings; onClose: () => void; onSuccess: (code: string) => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [selectedWilaya, setSelectedWilaya] = useState('');
  const [deliveryType, setDeliveryType] = useState<'home' | 'office'>('home');
  const [submitError, setSubmitError] = useState('');
  const createOrder = useCreateOrder();
  const queryClient = useQueryClient();
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const selectedRate = selectedWilaya ? settings.shippingRates[selectedWilaya] : undefined;
  const deliveryFee = selectedRate ? selectedRate[deliveryType] : 0;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload: OrderInput = { deviceId: getDeviceId(), name: String(data.get('name') || ''), phone: String(data.get('phone') || ''), wilaya: selectedWilaya, address: String(data.get('address') || ''), deliveryType, deliveryFee, total: total + deliveryFee, items: items.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })) };
    setSubmitError('');
    createOrder.mutate({ data: payload }, { onSuccess: order => { queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }); setCode(order.code); setSent(true); onSuccess(order.code); }, onError: error => setSubmitError(apiErrorMessage(error)) });
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal">
    <div className="modal-head"><div><h2>{sent ? 'تم تسجيل طلبك' : 'إتمام الطلب'}</h2><p>{sent ? 'احتفظ بهذا الرقم لمتابعة التوصيل' : 'الدفع عند الاستلام — داخل 69 ولاية'}</p></div><button type="button" className="close" onClick={onClose} data-testid="button-close-order"><X size={20} /></button></div>
    {sent ? <div className="order-success"><div className="success-mark"><Check size={25} /></div><p className="muted">رقم الطلب الخاص بك</p><strong className="mono cyan" style={{ fontSize: 22 }} data-testid="text-order-code">{code}</strong><p className="muted" style={{ lineHeight: 1.8 }}>سيتصل بك فريق GLOW STORE لتأكيد العنوان قبل الشحن.</p><button type="button" className="btn btn-primary" onClick={onClose} data-testid="button-finish-order">العودة للمتجر</button></div> :
      <form onSubmit={submit}>
        {submitError && <div className="notice error" role="alert" data-testid="status-order-error">{submitError}</div>}
        <div className="form-grid"><div className="field"><label htmlFor="order-name">الاسم الكامل</label><input className="input" id="order-name" name="name" required placeholder="اكتب اسمك" data-testid="input-order-name" /></div><div className="field"><label htmlFor="order-phone">رقم الهاتف</label><input className="input" id="order-phone" name="phone" required pattern=".{8,}" placeholder="05 / 06 / 07 ..." data-testid="input-order-phone" /></div><div className="field"><label htmlFor="order-wilaya">الولاية</label><select className="select" id="order-wilaya" name="wilaya" required value={selectedWilaya} onChange={e => setSelectedWilaya(e.target.value)} data-testid="select-order-wilaya"><option value="" disabled>اختر الولاية</option>{wilayas.map((w, i) => <option key={w} value={w}>{String(i + 1).padStart(2, '0')} — {w}</option>)}</select></div><div className="field"><label htmlFor="order-address">العنوان بالتفصيل</label><input className="input" id="order-address" name="address" required placeholder="الحي، الشارع، رقم المنزل" data-testid="input-order-address" /></div></div>
        <div className="delivery-choice"><label className={deliveryType === 'home' ? 'delivery-option active' : 'delivery-option'}><input type="radio" name="deliveryType" checked={deliveryType === 'home'} onChange={() => setDeliveryType('home')} data-testid="radio-delivery-home" /><Home size={16} /><span><strong>التوصيل للمنزل</strong><small>{selectedRate ? money(selectedRate.home) : 'اختر ولايتك أولاً'}</small></span></label><label className={deliveryType === 'office' ? 'delivery-option active' : 'delivery-option'}><input type="radio" name="deliveryType" checked={deliveryType === 'office'} onChange={() => setDeliveryType('office')} data-testid="radio-delivery-office" /><Building2 size={16} /><span><strong>التوصيل للمكتب</strong><small>{selectedRate ? money(selectedRate.office) : 'اختر ولايتك أولاً'}</small></span></label></div>
        <div className="notice" style={{ marginTop: 18, marginBottom: 0 }}><Truck size={15} style={{ verticalAlign: 'middle', marginLeft: 5 }} /> التوصيل يحسب حسب الولاية، وفريقنا يتصل بك للتأكيد.</div><div className="cart-total"><span>المنتجات <small className="muted">+ التوصيل</small></span><span className="cyan" data-testid="text-checkout-total">{money(total + deliveryFee)}</span></div><div className="form-actions"><button className="btn btn-primary" type="submit" disabled={createOrder.isPending} data-testid="button-submit-order">{createOrder.isPending ? 'جارٍ إرسال الطلب...' : 'تأكيد الطلب عند الاستلام'} <ArrowLeft size={16} /></button><button className="btn btn-quiet" type="button" onClick={onClose} data-testid="button-cancel-order">إلغاء</button></div>
      </form>}
  </div></div>;
}

function CartModal({ items, onClose, onChange, onCheckout }: { items: CartItem[]; onClose: () => void; onChange: (id: number, delta: number) => void; onCheckout: () => void }) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal">
    <div className="modal-head"><div><h2>سلة التسوق</h2><p data-testid="text-cart-summary">{items.length ? `${items.reduce((n, i) => n + i.quantity, 0)} قطع مختارة` : 'السلة فارغة حالياً'}</p></div><button type="button" className="close" onClick={onClose} data-testid="button-close-cart"><X size={20} /></button></div>
    {items.length ? <>{items.map(item => <div className="cart-item" key={item.id} data-testid={`row-cart-${item.id}`}><ProductVisual product={item} small /><div className="cart-item-info"><strong data-testid={`text-cart-name-${item.id}`}>{item.name}</strong><span data-testid={`text-cart-price-${item.id}`}>{money(item.price)}</span></div><div className="quantity"><button type="button" onClick={() => onChange(item.id, -1)} data-testid={`button-decrease-${item.id}`}><Minus size={13} /></button><span data-testid={`text-quantity-${item.id}`}>{item.quantity}</span><button type="button" onClick={() => onChange(item.id, 1)} data-testid={`button-increase-${item.id}`}><Plus size={13} /></button></div></div>)}<div className="cart-total"><span>المجموع</span><span className="cyan" data-testid="text-cart-total">{money(total)}</span></div><button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} type="button" onClick={onCheckout} data-testid="button-go-checkout">متابعة إلى بيانات التوصيل</button></> : <div className="empty-cart"><p className="muted" data-testid="status-empty-cart">لم تضف أي قطعة بعد.</p><button type="button" className="btn btn-primary" onClick={onClose} data-testid="button-browse-products">اكتشف الإضاءة</button></div>}
  </div></div>;
}

function PasswordModal({ onClose, onUnlock }: { onClose: () => void; onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const submit = (e: FormEvent) => { e.preventDefault(); if (password === 'dido123dido321') onUnlock(); else setError(true); };
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={submit}><div className="modal-head"><div><h2>منطقة خاصة</h2><p>لوحة إدارة GLOW STORE</p></div><button type="button" className="close" onClick={onClose} data-testid="button-close-password"><X size={20} /></button></div><div className="field"><label htmlFor="admin-password">كلمة المرور</label><input autoFocus className="input" id="admin-password" type="password" value={password} onChange={e => { setPassword(e.target.value); setError(false); }} data-testid="input-admin-password" /></div>{error && <p style={{ color: '#ffaaa4', fontSize: 12 }} role="alert" data-testid="status-admin-password-error">كلمة المرور غير صحيحة.</p>}<div className="form-actions"><button className="btn btn-primary" type="submit" data-testid="button-unlock-admin">دخول آمن</button><button className="btn btn-quiet" type="button" onClick={onClose} data-testid="button-cancel-password">إلغاء</button></div></form></div>;
}

function ProductForm({ editing, onCancel, onSaved }: { editing: Product; onCancel: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const [imageValue, setImageValue] = useState(editing.image || '');
  const [uploadMessage, setUploadMessage] = useState('');
  const { uploadFile, isUploading, progress } = useUpload();
  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setUploadMessage('اختر ملف صورة بصيغة PNG أو JPG أو WEBP.'); return; }
    if (file.size > 8 * 1024 * 1024) { setUploadMessage('حجم الصورة يجب ألا يتجاوز 8 ميغابايت.'); return; }
    setUploadMessage('جارٍ رفع الصورة...');
    const uploaded = await uploadFile(file);
    if (uploaded) {
      setImageValue(uploaded.objectPath);
      setUploadMessage('تم رفع الصورة. اضغط حفظ المنتج لتثبيتها.');
    } else {
      setUploadMessage('تعذر رفع الصورة. حاول مرة أخرى.');
    }
  };
  const saveProduct = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const payload: ProductInput = { name: String(d.get('name') || ''), description: String(d.get('description') || ''), price: Number(d.get('price') || 0), category: String(d.get('category') || ''), stock: Number(d.get('stock') || 0), art: String(d.get('art') || 'ring'), image: imageValue.trim().replace(/\/+$/, '') || null, featured: d.get('featured') === 'on', priceVisible: d.get('priceVisible') === 'on', stockVisible: d.get('stockVisible') === 'on', promotion: String(d.get('promotion') || '') || null };
    const options = { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onSaved(editing.id ? 'تم تحديث المنتج' : 'تمت إضافة المنتج'); }, onError: () => onSaved('تعذر حفظ المنتج. حاول مرة أخرى.') };
    if (editing.id) updateProduct.mutate({ id: editing.id, data: payload }, options); else createProduct.mutate({ data: payload }, options);
  };
  const pending = createProduct.isPending || updateProduct.isPending || isUploading;
  return <form onSubmit={saveProduct}><div className="admin-heading"><h3>{editing.id ? 'تعديل المنتج' : 'منتج جديد'}</h3><button className="close" type="button" onClick={onCancel} data-testid="button-cancel-product"><X size={17} /></button></div><div className="form-grid"><div className="field"><label htmlFor="product-name">اسم المنتج</label><input className="input" id="product-name" name="name" defaultValue={editing.name} required data-testid="input-product-name" /></div><div className="field"><label htmlFor="product-category">التصنيف</label><input className="input" id="product-category" name="category" defaultValue={editing.category} required data-testid="input-product-category" /></div><div className="field"><label htmlFor="product-price">السعر بالدينار</label><input className="input" id="product-price" type="number" min="0" name="price" defaultValue={editing.price} required data-testid="input-product-price" /></div><div className="field"><label htmlFor="product-stock">المخزون</label><input className="input" id="product-stock" type="number" min="0" name="stock" defaultValue={editing.stock} required data-testid="input-product-stock" /></div><div className="field full"><label htmlFor="product-description">الوصف</label><input className="input" id="product-description" name="description" defaultValue={editing.description} required data-testid="input-product-description" /></div><div className="field"><label htmlFor="product-art">نمط الصورة</label><select className="select" id="product-art" name="art" defaultValue={editing.art} data-testid="select-product-art"><option value="ring">حلقة</option><option value="tube">خط</option><option value="pendant">معلّق</option><option value="square">مربع</option></select></div><div className="field full"><label htmlFor="product-image">صورة المنتج</label><div className="image-upload">{imageValue && <img className="image-upload-preview" src={imageUrl(imageValue)} alt="معاينة صورة المنتج" />}<div className="image-upload-actions"><input className="file-input" id="product-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageChange} disabled={pending} data-testid="input-product-image-file" /></div>{uploadMessage && <small className="upload-status">{uploadMessage}{isUploading ? ` ${progress}%` : ''}</small>}<input className="input" name="image" value={imageValue} onChange={e => setImageValue(e.target.value)} placeholder="/اسم-الصورة.jpg أو رابط التخزين" data-testid="input-product-image" /></div></div><div className="field full"><label htmlFor="product-promotion">شريط العرض</label><input className="input" id="product-promotion" name="promotion" defaultValue={editing.promotion || ''} placeholder="مثال: تخفيض 20%" data-testid="input-product-promotion" /></div><label className="check-setting"><input type="checkbox" name="featured" defaultChecked={editing.featured} data-testid="checkbox-product-featured" /> <Eye size={15} /> مميز</label><label className="check-setting"><input type="checkbox" name="priceVisible" defaultChecked={editing.priceVisible} data-testid="checkbox-product-price-visible" /> <Eye size={15} /> إظهار السعر</label><label className="check-setting"><input type="checkbox" name="stockVisible" defaultChecked={editing.stockVisible} data-testid="checkbox-product-stock-visible" /> <Eye size={15} /> إظهار المخزون</label></div><div className="form-actions"><button className="btn btn-primary" type="submit" disabled={pending} data-testid="button-save-product">{pending ? 'جارٍ الحفظ...' : 'حفظ المنتج'}</button><button className="btn btn-quiet" type="button" onClick={onCancel} data-testid="button-cancel-product-form">إلغاء</button></div></form>;
}

function OrdersPanel() {
  const ordersQuery = useListOrders();
  const orders = ordersQuery.data || [];
  if (ordersQuery.isLoading) return <div className="admin-list"><div className="skeleton" style={{ minHeight: 90 }} /><div className="skeleton" style={{ minHeight: 90 }} /></div>;
  if (ordersQuery.isError) return <div className="notice error" role="alert" data-testid="status-orders-error">تعذر تحميل الطلبات من الخادم. <button className="btn btn-quiet" type="button" onClick={() => ordersQuery.refetch()} data-testid="button-retry-orders">إعادة المحاولة</button></div>;
  return <>{orders.length ? <div className="admin-list">{orders.map((order: Order) => <div className="admin-row" key={order.id} data-testid={`row-admin-order-${order.id}`}><div><strong data-testid={`text-order-customer-${order.id}`}>{order.name} — {order.wilaya}</strong><small>{order.phone} · {order.code} · {order.deliveryType === 'home' ? 'المنزل' : 'المكتب'}</small></div><span className="mono cyan" data-testid={`text-order-total-${order.id}`}>{money(order.total)}</span><PackageCheck size={17} className="muted" /></div>)}</div> : <div className="notice" data-testid="status-empty-orders">لا توجد طلبات محفوظة على الخادم بعد.</div>}</>;
}

function AdminModal({ products, settings, setSettings, onClose }: { products: Product[]; settings: StoreSettings; setSettings: (s: StoreSettings) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'products' | 'orders' | 'settings'>('products');
  const [editing, setEditing] = useState<Product | null>(null);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const deleteProduct = useDeleteProduct();
  const updateSettings = (key: keyof Omit<StoreSettings, 'shippingRates'>, value: string) => { const next = { ...settings, [key]: value }; setSettings(next); save('glowstore-settings', next); };
  const updateRate = (name: string, key: keyof ShippingRate, value: number | boolean) => { const next = { ...settings, shippingRates: { ...settings.shippingRates, [name]: { ...settings.shippingRates[name], [key]: value } } }; setSettings(next); save('glowstore-settings', next); };
  const removeProduct = (id: number) => { if (window.confirm('حذف هذا المنتج؟')) deleteProduct.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); setMessage('تم حذف المنتج'); }, onError: () => setMessage('تعذر حذف المنتج. حاول مرة أخرى.') }); };
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal wide">
    <div className="modal-head"><div><div className="eyebrow">STORE CONTROL</div><h2 style={{ marginTop: 10 }}>لوحة المتجر</h2><p>المنتجات والطلبات متزامنة مع الخادم</p></div><button type="button" className="close" onClick={onClose} data-testid="button-close-admin"><X size={20} /></button></div>
    <div className="admin-tabs">{([['products', 'المنتجات والأسعار'], ['orders', 'الطلبات'], ['settings', 'الإعدادات']] as const).map(([key, label]) => <button type="button" className={`admin-tab ${tab === key ? 'active' : ''}`} onClick={() => { setTab(key); setMessage(''); }} key={key} data-testid={`tab-admin-${key}`}>{label}</button>)}</div>
    {message && <div className="notice" data-testid="status-admin-message">{message}</div>}
    {tab === 'products' && <>{editing ? <ProductForm editing={editing} onCancel={() => setEditing(null)} onSaved={messageText => { setEditing(null); setMessage(messageText); }} /> : <><div className="admin-heading"><h3>كتالوج المنتجات <span className="muted" data-testid="text-admin-product-count">({products.length})</span></h3><button type="button" className="btn btn-primary" onClick={() => setEditing({ id: 0, name: '', description: '', price: 0, category: 'جديد', stock: 0, art: 'ring', image: null, featured: false, priceVisible: true, stockVisible: true, promotion: null })} data-testid="button-new-product"><Plus size={15} /> منتج جديد</button></div>{products.length ? <div className="admin-list">{products.map(product => <div className="admin-row" key={product.id} data-testid={`row-admin-product-${product.id}`}><div><strong data-testid={`text-admin-product-${product.id}`}>{product.name}</strong><small>{product.category} · {product.stockVisible === false ? 'الكمية مخفية' : `مخزون ${product.stock}`}</small></div><span className="row-price mono cyan" data-testid={`text-admin-price-${product.id}`}>{product.priceVisible === false ? 'السعر مخفي' : money(product.price)}</span><div className="row-actions"><button type="button" className="icon-btn" onClick={() => setEditing(product)} data-testid={`button-edit-product-${product.id}`} aria-label={`تعديل ${product.name}`}><Pencil size={15} /></button><button type="button" className="icon-btn" disabled={deleteProduct.isPending} onClick={() => removeProduct(product.id)} data-testid={`button-delete-product-${product.id}`} aria-label={`حذف ${product.name}`}><Trash2 size={15} /></button></div></div>)}</div> : <div className="notice" data-testid="status-empty-products">لا توجد منتجات في الكتالوج بعد.</div>}</>}</>}
    {tab === 'orders' && <><div className="admin-heading"><h3>طلبات الخادم</h3><span className="muted" data-testid="text-admin-orders-label">آخر الطلبات</span></div><OrdersPanel /></>}
    {tab === 'settings' && <><div className="notice">هذه الإعدادات محلية لهذا الجهاز، وتظهر للعملاء فور حفظها.</div><div className="form-grid">{([['promotion', 'شريط العرض / الترويج'], ['shipping', 'نص التوصيل'], ['instagram', 'حساب Instagram'], ['whatsapp', 'رقم WhatsApp بصيغة دولية']] as const).map(([key, label]) => <div className="field full" key={key}><label htmlFor={`setting-${key}`}>{label}</label><input className="input" id={`setting-${key}`} value={settings[key]} onChange={e => updateSettings(key, e.target.value)} data-testid={`input-setting-${key}`} /></div>)}</div><div className="admin-heading rate-heading"><h3>أسعار التوصيل حسب الولاية</h3><span className="muted">{wilayas.length} ولاية</span></div><div className="shipping-admin-list">{wilayas.map((name, index) => { const rate = settings.shippingRates[name]; return <div className="shipping-admin-row" key={name}><div className="wilaya-name"><span className="mono muted">{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong></div><label className="check-setting"><input type="checkbox" checked={rate.visible} onChange={e => updateRate(name, 'visible', e.target.checked)} data-testid={`checkbox-rate-visible-${index + 1}`} /><span>{rate.visible ? <Eye size={14} /> : <EyeOff size={14} />}</span> إظهار</label><label><small>للمنزل</small><input className="small-input" type="number" value={rate.home} onChange={e => updateRate(name, 'home', Number(e.target.value))} data-testid={`input-rate-home-${index + 1}`} /></label><label><small>للمكتب</small><input className="small-input" type="number" value={rate.office} onChange={e => updateRate(name, 'office', Number(e.target.value))} data-testid={`input-rate-office-${index + 1}`} /></label></div>; })}</div></>}
  </div></div>;
}

function Storefront() {
  const productsQuery = useListProducts();
  const products = productsQuery.data || [];
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('الكل');
  const [cartOpen, setCartOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [lookup, setLookup] = useState('');
  const [lookupResult, setLookupResult] = useState('');
  const clickCount = useRef(0);
  const clickTimer = useRef<number | undefined>(undefined);
  const categories = useMemo(() => ['الكل', ...Array.from(new Set((products || []).map(product => product.category)))], [products]);
  const visible = category === 'الكل' ? (products || []) : (products || []).filter(product => product.category === category);
  const cartCount = cart.reduce((n, item) => n + item.quantity, 0);
  const add = (product: Product) => { setCart(prev => { const found = prev.find(item => item.id === product.id); return found ? prev.map(item => item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item) : [...prev, { ...product, quantity: 1 }]; }); setToast('أضيفت القطعة إلى السلة'); window.setTimeout(() => setToast(''), 2200); };
  const changeQuantity = (id: number, delta: number) => setCart(prev => prev.flatMap(item => item.id !== id ? [item] : item.quantity + delta <= 0 ? [] : [{ ...item, quantity: Math.min(item.quantity + delta, item.stock) }]));
  const logoClick = () => { clickCount.current += 1; window.clearTimeout(clickTimer.current); if (clickCount.current === 3) { setPasswordOpen(true); clickCount.current = 0; } else clickTimer.current = window.setTimeout(() => { clickCount.current = 0; }, 500); };
  const doLookup = () => { const clean = lookup.trim().toLowerCase(); const found = wilayas.findIndex(w => w.toLowerCase() === clean || String(wilayas.indexOf(w) + 1).padStart(2, '0') === clean); const rate = found >= 0 ? settings.shippingRates[wilayas[found]] : undefined; setLookupResult(clean ? found >= 0 && rate?.visible ? `نعم، نوصّل إلى ${wilayas[found]} — المنزل ${money(rate.home)} · المكتب ${money(rate.office)}.` : found >= 0 ? 'التوصيل إلى هذه الولاية مخفي مؤقتاً. تواصل معنا للتأكيد.' : 'لم نجد الولاية. اختر من القائمة أو اكتب الاسم كاملاً.' : 'اكتب اسم الولاية للبحث.'); };
  return <div className="site-shell" dir="rtl">
    <div className="starfield" aria-hidden="true">{starPositions.map(([left, top, size], index) => <span className={`star star-${index % 4}`} key={index} style={{ left: `${left}%`, top: `${top}%`, width: `${size}px`, height: `${size}px`, animationDelay: `${-(index * 1.7)}s`, animationDuration: `${26 + (index % 5) * 5}s` }} />)}</div>
    <header className="topbar"><div className="container topbar-inner"><button type="button" className="logo-button" onClick={logoClick} aria-label="GLOW STORE" data-testid="button-secret-logo"><img src="/glowstore-logo.png" alt="GLOW STORE" /><span className="logo-word">GLOW STORE</span></button><nav className="topnav"><a className="nav-link desktop-only" href="#collection" data-testid="link-collection">المنتجات</a><a className="nav-link desktop-only" href="#delivery" data-testid="link-delivery">التوصيل</a><a className="contact-link" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" data-testid="link-whatsapp"><MessageCircle size={15} /><span className="desktop-only">واتساب</span></a><button type="button" className="cart-button" onClick={() => setCartOpen(true)} data-testid="button-open-cart"><ShoppingBag size={16} /><span>السلة</span>{cartCount > 0 && <b className="cart-count" data-testid="text-cart-count">{cartCount}</b>}</button></nav></div></header>
    <main>
      <section className="hero"><div className="container hero-content"><div className="reveal"><div className="eyebrow">إضاءة وديكور من الجزائر</div><h1>غرفتك ليست غرفة.<br /><em>إنها مجرّتك الخاصة.</em></h1><p className="hero-copy">قطع ضوء مختارة تمنح المساحة شخصية، مع توصيل موثوق إلى 69 ولاية والدفع عند الاستلام.</p><div className="hero-actions"><a className="btn btn-primary" href="#collection" data-testid="link-shop-now">استعرض المجموعة <ArrowLeft size={16} /></a><a className="btn btn-quiet" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" data-testid="link-hero-whatsapp">اطلب عبر واتساب <MessageCircle size={15} /></a></div></div></div></section>
      <div className="story-band"><div className="container story-line"><strong>ضوء يترك أثراً.</strong><span>تشكيلة صغيرة، حضور واضح، وقطع لا تشبه الخلفية.</span><span className="mono cyan">ORBIT 04 — DZ</span></div></div>
      <section className="section" id="collection"><div className="container"><div className="section-head"><div><div className="eyebrow">المجموعة الحالية</div><h2 className="section-title">اختر مداراً<br />لمساحتك.</h2></div><p className="section-note">لا نملأ الرفوف. نختار قطعاً لها شخصية، بأسعار واضحة ومخزون حقيقي.</p></div>{productsQuery.isLoading ? <div className="product-grid" data-testid="status-loading-products">{[1,2,3].map(id => <div className="skeleton" key={id} />)}</div> : productsQuery.isError ? <div className="notice error" role="alert" data-testid="status-products-error">تعذر تحميل المجموعة. <button className="btn btn-quiet" type="button" onClick={() => productsQuery.refetch()} data-testid="button-retry-products">إعادة المحاولة</button></div> : products.length ? <><div className="filters" role="tablist">{categories.map(item => <button type="button" className={`filter ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)} key={item} data-testid={`button-filter-${item}`}>{item}</button>)}</div><div className="product-grid">{visible.map((product, index) => <div key={product.id} className={`delay-${Math.min(index + 1, 2)}`}><ProductCard product={product} onAdd={add} /></div>)}</div>{visible.length === 0 && <div className="notice" data-testid="status-empty-category">لا توجد قطع في هذا التصنيف حالياً.</div>}</> : <div className="notice" data-testid="status-empty-products">لا توجد قطع في المجموعة حالياً. عد قريباً لاكتشاف المدار القادم.</div>}</div></section>
      <section className="section" id="delivery" style={{ paddingTop: 30 }}><div className="container services"><div className="service-block"><div className="eyebrow">نصل إليك</div><h3 style={{ marginTop: 15 }}>من الجزائر العاصمة إلى جانت.</h3><p>{settings.shipping}. نغلف كل قطعة بعناية ونتابع معك حتى تصل.</p><div className="lookup"><input className="input" value={lookup} onChange={e => setLookup(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLookup()} placeholder="ابحث باسم الولاية أو رقمها" data-testid="input-wilaya-lookup" /><button type="button" className="btn btn-primary" onClick={doLookup} data-testid="button-wilaya-lookup"><Search size={16} /> بحث</button></div>{lookupResult && <div className="lookup-result" data-testid="text-lookup-result">{lookupResult}</div>}</div><div className="service-block"><MapPin size={20} className="cyan" /><h3>69 ولاية</h3><p>الدفع عند الاستلام. مكالمة قصيرة للتأكيد. أسعار المنزل والمكتب واضحة قبل الطلب.</p><div style={{ marginTop: 22 }}><span className="mono cyan">01 — 69</span><span className="muted" style={{ marginRight: 12 }}>تغطية قابلة للتحكم</span></div></div></div></section>
      <section className="section" style={{ paddingTop: 30 }}><div className="container" style={{ borderTop: '1px solid rgba(166,190,239,.14)', paddingTop: 42 }}><div className="section-head"><div><div className="eyebrow">على ذوقك</div><h2 className="section-title">إضاءة هادئة.<br /><span className="cyan">فرق واضح.</span></h2></div><p className="section-note">من أول وهج حتى آخر تفصيلة، نصمم تجربة شراء تتركك مطمئناً.</p></div></div></section>
    </main>
    <footer className="footer"><div className="container footer-row"><div><span className="mono cyan">GLOW STORE</span><span style={{ marginRight: 12 }}>إضاءة وديكور من الجزائر.</span></div><div className="socials"><a className="nav-link" href={`https://instagram.com/${settings.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" data-testid="link-instagram"><Instagram size={16} /> {settings.instagram}</a><a className="nav-link" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" data-testid="footer-whatsapp"><MessageCircle size={16} /> واتساب</a><a className="nav-link" href="#collection" data-testid="link-footer-collection">المجموعة <ArrowUpRight size={14} /></a></div><span className="muted">الدفع عند الاستلام · 69 ولاية</span></div></footer>
    {cartOpen && <CartModal items={cart} onClose={() => setCartOpen(false)} onChange={changeQuantity} onCheckout={() => { setCartOpen(false); setOrderOpen(true); }} />}
    {orderOpen && <OrderModal items={cart} settings={settings} onClose={() => { setOrderOpen(false); }} onSuccess={code => { setCart([]); setToast(`تم تأكيد الطلب ${code}`); }} />}
    {passwordOpen && <PasswordModal onClose={() => setPasswordOpen(false)} onUnlock={() => { setPasswordOpen(false); setAdminOpen(true); }} />}
    {adminOpen && <AdminModal products={products} settings={settings} setSettings={setSettings} onClose={() => setAdminOpen(false)} />}
    {toast && <div className="toast" data-testid="status-toast">{toast}</div>}
  </div>;
}

function Router() { return <ErrorBoundary><Switch><Route path="/" component={Storefront} /><Route component={Storefront} /></Switch></ErrorBoundary>; }
const queryClient = new QueryClient();
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;