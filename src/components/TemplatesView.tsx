import React, { useState, useEffect } from 'react';
import { 
  FileCode, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  X, 
  Play, 
  Sparkles, 
  Eye 
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { EmailTemplate } from '../types';
import { toast } from 'react-hot-toast';
import { ConfirmationModal } from './ConfirmationModal';

interface TemplatesViewProps {
  onNavigate: (view: any, data?: any) => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({ onNavigate }) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Newsletter');

  // Preview State
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'emailTemplates'), (snapshot) => {
      const list: EmailTemplate[] = [];
      snapshot.forEach(doc => {
        list.push({ ...(doc.data() as EmailTemplate), id: doc.id });
      });
      list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTemplates(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openAddModal = () => {
    setEditingTemplate(null);
    setName('');
    setSubject('');
    setBody('');
    setCategory('Newsletter');
    setShowModal(true);
  };

  const openEditModal = (temp: EmailTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTemplate(temp);
    setName(temp.name);
    setSubject(temp.subject);
    setBody(temp.body);
    setCategory(temp.category || 'Newsletter');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject || !body) {
      toast.error("Template Name, Subject, and Body code are required");
      return;
    }

    try {
      if (editingTemplate) {
        await setDoc(doc(db, 'emailTemplates', editingTemplate.id), {
          name,
          subject,
          body,
          category,
          createdBy: editingTemplate.createdBy,
          createdAt: editingTemplate.createdAt
        });
        toast.success("Template updated!");
      } else {
        await addDoc(collection(db, 'emailTemplates'), {
          name,
          subject,
          body,
          category,
          createdBy: auth.currentUser?.email || 'System',
          createdAt: new Date().toISOString()
        });
        toast.success("Template created!");
      }
      setShowModal(false);
    } catch (err: any) {
      toast.error(`Error saving: ${err.message}`);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTemplateId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTemplateId) return;
    try {
      await deleteDoc(doc(db, 'emailTemplates', deleteTemplateId));
      toast.success("Template deleted successfully");
      setDeleteTemplateId(null);
    } catch (err: any) {
      toast.error("Failed to delete template");
    }
  };

  const handleUseTemplate = (temp: EmailTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate('compose', {
      title: `${temp.name} Campaign`,
      subject: temp.subject,
      body: temp.body,
      type: (temp.category === 'Newsletter' || temp.category === 'Promotion') ? temp.category : 'Newsletter',
      recipientTags: []
    });
  };

  const filtered = templates.filter(t => 
    t.name?.toLowerCase().includes(search.toLowerCase()) || 
    t.subject?.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 font-semibold text-white rounded-lg text-xs"
        >
          <Plus className="w-4 h-4" /> Create Template
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative">
          <input
            type="text"
            placeholder="Search templates by name or subject line..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          <p className="text-sm">No templates defined.</p>
          <button
            onClick={openAddModal}
            className="mt-3 text-xs bg-amber-50 dark:bg-amber-950/20 text-amber-600 px-3 py-1.5 rounded font-semibold hover:bg-amber-100"
          >
            Create your first layout
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(temp => (
            <div
              key={temp.id}
              onClick={() => setPreviewTemplate(temp)}
              className="bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer relative flex flex-col justify-between group min-h-[180px]"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <span className="bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                    {temp.category}
                  </span>
                  
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => openEditModal(temp, e)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500"
                      title="Edit layout"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(temp.id, e)}
                      className="p-1 hover:bg-red-50 rounded text-red-500"
                      title="Delete layout"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-slate-900 dark:text-white mt-1 group-hover:text-amber-500 transition-colors">{temp.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">Subject: {temp.subject}</p>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Created: {new Date(temp.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={(e) => handleUseTemplate(temp, e)}
                  className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 text-amber-600 dark:text-amber-400 text-xs px-2.5 py-1 rounded font-semibold transition-all"
                >
                  <Play className="w-3 h-3 fill-current" /> Use Layout
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create template Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editingTemplate ? "Modify Email Template" : "Build Layout Template"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Template Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Weekly Update Template"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-950 dark:text-white"
                  >
                    <option value="Newsletter">Newsletter</option>
                    <option value="Promotion">Promotion</option>
                    <option value="Announcement">Announcement</option>
                    <option value="Follow-up">Follow-up</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Standard Subject Pre-fill</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Latest news update for you, {{name}}"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Template HTML Code Body</label>
                <textarea
                  rows={10}
                  required
                  placeholder="<h1>Hello {{name}}</h1><p>This is standard template content</p>"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white min-h-[200px]"
                />
                <p className="text-[10px] text-slate-400 mt-1">Accepts standard HTML headers, structures, inline CSS styling, and personal markers.</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold"
              >
                Save Layout template
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HTML Layout previews window */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">{previewTemplate.name}</h3>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-600 dark:text-slate-400 mt-1 inline-block">
                  Subject Preview: {previewTemplate.subject}
                </span>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-1 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-950">
              <div className="border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-900 p-4 prose dark:prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: previewTemplate.body }} />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-xs font-semibold"
              >
                Cancel Preview
              </button>
              <button
                onClick={(e) => {
                  handleUseTemplate(previewTemplate, e as any);
                  setPreviewTemplate(null);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold flex items-center gap-1"
              >
                <Play className="w-3 h-3 fill-current" /> Use Draft Layout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete template confirmation modal */}
      <ConfirmationModal
        isOpen={deleteTemplateId !== null}
        onClose={() => setDeleteTemplateId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Email Template"
        message="Are you sure you want to permanently delete this email template layout? This action cannot be undone."
        confirmText="Delete Layout"
        cancelText="Keep Layout"
        isDanger={true}
      />
    </div>
  );
};
