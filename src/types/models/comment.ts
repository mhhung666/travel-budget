/**
 * 一則支出留言（前端 DTO）。掛在單筆 Expense 下；`author_name` 為事件當下快照。
 */
export interface CommentDto {
  id: string;
  expense_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}
