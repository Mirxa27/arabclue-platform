"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  Check,
  Reply,
  Loader2,
  AtSign,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CollaborationComment } from "@/lib/proposal-builder-types";

export function CollaborationComments({
  proposalId,
  sectionKey,
  locale,
  currentUserId,
}: {
  proposalId: string | null;
  sectionKey?: string;
  locale: string;
  currentUserId?: string;
}) {
  const ar = locale === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<{ id: string; content: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Fetch comments
  const { data, isLoading } = useQuery({
    queryKey: ["comments", proposalId, sectionKey],
    queryFn: async () => {
      if (!proposalId) return { comments: [] };
      const params = new URLSearchParams({ proposalId });
      if (sectionKey) params.set("sectionKey", sectionKey);
      const res = await fetch(`/api/collaboration/comments?${params}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json() as Promise<{ comments: CollaborationComment[] }>;
    },
    enabled: !!proposalId,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/collaboration/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId,
          sectionKey,
          content,
          parentId: replyingTo,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        throw new Error(
          body.error ||
            (res.status === 501
              ? "Collaboration comments are not available on this database yet."
              : "Failed to add comment")
        );
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", proposalId, sectionKey] });
      setNewComment("");
      setReplyingTo(null);
      toast({
        title: ar ? "تمت الإضافة" : "Added",
        description: ar ? "تمت إضافة التعليق" : "Comment added",
      });
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description:
          err instanceof Error
            ? err.message
            : ar
              ? "فشل إضافة التعليق"
              : "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  // Edit comment mutation
  const editCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch(`/api/collaboration/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        if (body.error === "COMMENT_EDIT_FORBIDDEN") {
          throw new Error(ar ? "لا يمكنك تحرير تعليق شخص آخر" : "You cannot edit another user's comment");
        }
        if (body.error === "COMMENT_RESOLVED") {
          throw new Error(ar ? "لا يمكن تحرير تعليق محلول" : "Cannot edit a resolved comment");
        }
        throw new Error(body.message || body.error || "Failed to edit comment");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", proposalId, sectionKey] });
      setEditingComment(null);
      toast({
        title: ar ? "تم التحديث" : "Updated",
        description: ar ? "تم تحديث التعليق" : "Comment updated",
      });
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description: err instanceof Error ? err.message : ar ? "فشل تحرير التعليق" : "Failed to edit comment",
        variant: "destructive",
      });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/collaboration/comments/${id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        if (body.error === "COMMENT_DELETE_FORBIDDEN") {
          throw new Error(ar ? "ليس لديك صلاحية حذف هذا التعليق" : "You do not have permission to delete this comment");
        }
        throw new Error(body.message || body.error || "Failed to delete comment");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", proposalId, sectionKey] });
      setDeleteConfirm(null);
      toast({
        title: ar ? "تم الحذف" : "Deleted",
        description: ar ? "تم حذف التعليق" : "Comment deleted",
      });
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description: err instanceof Error ? err.message : ar ? "فشل حذف التعليق" : "Failed to delete comment",
        variant: "destructive",
      });
    },
  });

  // Resolve comment mutation
  const resolveMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/collaboration/comments/${commentId}/resolve`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "Failed to resolve comment");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", proposalId, sectionKey] });
      toast({
        title: ar ? "تم الحل" : "Resolved",
        description: ar ? "تم وضع علامة محلول على التعليق" : "Comment marked resolved",
      });
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description:
          err instanceof Error
            ? err.message
            : ar
              ? "فشل حل التعليق"
              : "Failed to resolve comment",
        variant: "destructive",
      });
    },
  });

  const comments = data?.comments ?? [];
  const unresolvedCount = comments.filter((c) => !c.isResolved && !c.parentId).length;

  const handleSubmit = useCallback(() => {
    if (!newComment.trim() || addCommentMutation.isPending) return;
    addCommentMutation.mutate(newComment.trim());
  }, [newComment, addCommentMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleEditSubmit = useCallback(() => {
    if (!editingComment || !editingComment.content.trim() || editCommentMutation.isPending) return;
    editCommentMutation.mutate({ id: editingComment.id, content: editingComment.content.trim() });
  }, [editingComment, editCommentMutation]);

  if (!proposalId) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {ar ? "اختر عرضاً لعرض التعليقات" : "Select a proposal to view comments"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {ar ? "التعليقات" : "Comments"}
          </span>
          {unresolvedCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {unresolvedCount}
            </Badge>
          )}
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="size-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              {ar ? "لا توجد تعليقات بعد" : "No comments yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments
              .filter((c) => !c.parentId)
              .map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  replies={comments.filter((c) => c.parentId === comment.id)}
                  locale={locale}
                  currentUserId={currentUserId}
                  onReply={() => setReplyingTo(comment.id)}
                  onResolve={() => resolveMutation.mutate(comment.id)}
                  onEdit={(content) => setEditingComment({ id: comment.id, content })}
                  onDelete={() => setDeleteConfirm(comment.id)}
                  isResolving={resolveMutation.isPending}
                />
              ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingComment && (
        <div className="border-t border-border/50 bg-muted/30 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Pencil className="size-3" />
            {ar ? "تحرير التعليق" : "Editing comment"}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-[10px]"
              onClick={() => setEditingComment(null)}
            >
              {ar ? "إلغاء" : "Cancel"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Textarea
              value={editingComment.content}
              onChange={(e) => setEditingComment({ ...editingComment, content: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleEditSubmit();
                }
              }}
              className="min-h-[60px] resize-none text-sm"
              rows={2}
            />
            <Button
              type="button"
              size="icon"
              className="h-auto shrink-0"
              onClick={handleEditSubmit}
              disabled={!editingComment.content.trim() || editCommentMutation.isPending}
            >
              {editCommentMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* New comment input */}
      {!editingComment && (
        <div className="border-t border-border/50 p-4">
          {replyingTo && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Reply className="size-3" />
              {ar ? "الرد على تعليق" : "Replying to comment"}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px]"
                onClick={() => setReplyingTo(null)}
              >
                {ar ? "إلغاء" : "Cancel"}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ar ? "اكتب تعليقاً... (Ctrl+Enter للإرسال)" : "Write a comment... (Ctrl+Enter to send)"}
              className="min-h-[60px] resize-none text-sm"
              rows={2}
            />
            <Button
              type="button"
              size="icon"
              className="h-auto shrink-0"
              onClick={handleSubmit}
              disabled={!newComment.trim() || addCommentMutation.isPending}
            >
              {addCommentMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ar ? "حذف التعليق" : "Delete Comment"}</AlertDialogTitle>
            <AlertDialogDescription>
              {ar
                ? "هل أنت متأكد من حذف هذا التعليق؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this comment? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteCommentMutation.mutate(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCommentMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                ar ? "حذف" : "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  locale,
  currentUserId,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  isResolving,
}: {
  comment: CollaborationComment;
  replies: CollaborationComment[];
  locale: string;
  currentUserId?: string;
  onReply: () => void;
  onResolve: () => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
  isResolving: boolean;
}) {
  const ar = locale === "ar";
  const isAuthor = currentUserId === comment.createdBy;
  const isWithdrawn = (comment as CollaborationComment & { isWithdrawn?: boolean }).isWithdrawn;
  const editedAt = (comment as CollaborationComment & { editedAt?: string }).editedAt;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        comment.isResolved
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isWithdrawn
            ? "border-muted bg-muted/30"
            : "border-border/60 bg-background/50"
      )}
    >
      {/* Comment header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {comment.creatorName.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-medium">{comment.creatorName}</span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(comment.createdAt).toLocaleDateString(ar ? "ar-SA" : "en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {editedAt && (
            <span className="text-[9px] text-muted-foreground italic">
              ({ar ? "تم التحرير" : "edited"})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isWithdrawn ? (
            <Badge variant="outline" className="gap-1 text-[9px] text-muted-foreground">
              {ar ? "محذوف" : "Withdrawn"}
            </Badge>
          ) : comment.isResolved ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/50 text-[9px] text-emerald-600">
              <Check className="size-3" />
              {ar ? "تم الحل" : "Resolved"}
            </Badge>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={onReply}
              >
                <Reply className="size-3" />
                {ar ? "رد" : "Reply"}
              </Button>
              {isAuthor && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => onEdit(comment.content)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px] text-destructive hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={onResolve}
                disabled={isResolving}
              >
                <Check className="size-3" />
                {ar ? "حل" : "Resolve"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Comment content */}
      {isWithdrawn ? (
        <p className="text-sm italic text-muted-foreground">
          {ar ? "[تم حذف هذا التعليق]" : "[This comment has been deleted]"}
        </p>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      )}

      {/* Mentions */}
      {!isWithdrawn && comment.mentions && comment.mentions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {comment.mentions.map((userId) => (
            <Badge key={userId} variant="outline" className="gap-0.5 text-[9px]">
              <AtSign className="size-2.5" />
              {userId.slice(0, 8)}
            </Badge>
          ))}
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-3 space-y-2 border-s-2 border-border/30 ps-3">
          {replies.map((reply) => {
            const replyWithdrawn = (reply as CollaborationComment & { isWithdrawn?: boolean }).isWithdrawn;
            const replyEdited = (reply as CollaborationComment & { editedAt?: string }).editedAt;
            return (
              <div key={reply.id} className={cn("rounded bg-muted/30 p-2", replyWithdrawn && "opacity-60")}>
                <div className="mb-1 flex items-center gap-2">
                  <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                    {reply.creatorName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-medium">{reply.creatorName}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(reply.createdAt).toLocaleDateString(ar ? "ar-SA" : "en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {replyEdited && (
                    <span className="text-[8px] text-muted-foreground italic">
                      ({ar ? "تم التحرير" : "edited"})
                    </span>
                  )}
                </div>
                {replyWithdrawn ? (
                  <p className="text-xs italic text-muted-foreground">
                    {ar ? "[تم حذف هذا الرد]" : "[This reply has been deleted]"}
                  </p>
                ) : (
                  <p className="text-xs whitespace-pre-wrap">{reply.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
