import { useState, type InputHTMLAttributes } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { messageStudioApi } from '../../services/api';
import type { StudioProduct } from '../../types/messageStudio';

interface ProductFormProps {
  product: StudioProduct | null;
  onClose: () => void;
  onSaved: (product: StudioProduct) => void;
}

const isHttps = (v: string) => !v || /^https:\/\/\S+$/i.test(v.trim());

/** Add or edit one product. Links must be https so WhatsApp can load them. */
export function ProductForm({ product, onClose, onSaved }: ProductFormProps) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    category: product?.category ?? '',
    description: product?.description ?? '',
    price: product ? String(product.price) : '',
    currency: product?.currency ?? 'INR',
    imageUrl: product?.imageUrl ?? '',
    productUrl: product?.productUrl ?? '',
    retailerId: product?.retailerId ?? '',
    inStock: product?.inStock ?? true,
  });
  const set = (key: keyof typeof form, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));

  const price = Number(form.price);
  const errors: Partial<Record<keyof typeof form, string>> = {};
  if (!form.name.trim()) errors.name = 'Enter a product name.';
  if (form.price === '' || !Number.isFinite(price) || price < 0) errors.price = 'Enter a price of 0 or more.';
  if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) errors.currency = 'Use a 3-letter code like INR.';
  if (!isHttps(form.imageUrl)) errors.imageUrl = 'Use an https:// link.';
  if (!isHttps(form.productUrl)) errors.productUrl = 'Use an https:// link.';
  const [touched, setTouched] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const body: Partial<StudioProduct> = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        price,
        currency: form.currency.trim().toUpperCase(),
        imageUrl: form.imageUrl.trim() || null,
        productUrl: form.productUrl.trim() || null,
        retailerId: form.retailerId.trim() || null,
        inStock: form.inStock,
      };
      return product ? messageStudioApi.updateProduct(product.id, body) : messageStudioApi.createProduct(body);
    },
    onSuccess: p => {
      toast.success(product ? 'Product updated' : 'Product added', p.name);
      onSaved(p);
    },
    onError: (e: Error) => toast.error('Could not save the product', e.message),
  });

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };
  const err = (key: keyof typeof form) =>
    touched && errors[key] ? (
      <span className="ms-field-error" id={`pf-${key}-err`}>
        {errors[key]}
      </span>
    ) : null;
  const field = (key: keyof typeof form, label: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="ms-field">
      <span className="ms-label">{label}</span>
      <input
        className="ms-input"
        value={String(form[key])}
        onChange={e => set(key, e.target.value)}
        aria-invalid={Boolean(touched && errors[key])}
        aria-describedby={touched && errors[key] ? `pf-${key}-err` : undefined}
        {...extra}
      />
      {err(key)}
    </label>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Edit product' : 'Add product'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Back
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save product'}
          </button>
        </>
      }
    >
      <div className="ms-form-grid">
        {field('name', 'Name *', { maxLength: 120 })}
        {field('sku', 'SKU', { maxLength: 64 })}
        {field('price', 'Price *', { inputMode: 'decimal' })}
        {field('currency', 'Currency', { maxLength: 3 })}
        {field('category', 'Category', { maxLength: 60 })}
        {field('retailerId', 'Meta catalog id (Content ID)', { maxLength: 100 })}
        {field('imageUrl', 'Image link (https)', { type: 'url', placeholder: 'https://…' })}
        {field('productUrl', 'Product page link (https)', { type: 'url', placeholder: 'https://…' })}
      </div>
      <label className="ms-field">
        <span className="ms-label">Description</span>
        <textarea
          className="ms-input"
          rows={2}
          maxLength={500}
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
      </label>
      <label className="ms-check">
        <input type="checkbox" checked={form.inStock} onChange={e => set('inStock', e.target.checked)} /> In stock
      </label>
    </Modal>
  );
}
