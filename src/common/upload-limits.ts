// Limites de upload aplicados a TODOS os FileInterceptor/FilesInterceptor.
// 55 MB acomoda o máximo de PDF (50 MB) já validado no CloudinaryService.
// O Multer aborta o stream ao atingir o limite, evitando esgotar a memória
// do servidor com ficheiros enormes antes da validação de tamanho.
export const UPLOAD_LIMITS = {
  limits: { fileSize: 55 * 1024 * 1024, files: 15 },
};
