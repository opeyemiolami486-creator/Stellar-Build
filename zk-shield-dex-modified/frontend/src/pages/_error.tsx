import React from "react";

export default function ErrorPage() {
  return (
    <html>
      <body>
        <div style={{padding:40,textAlign:'center'}}>
          <h1 style={{fontSize:24,marginBottom:8}}>Something went wrong</h1>
          <p style={{color:'#888'}}>An unexpected error occurred.</p>
        </div>
      </body>
    </html>
  );
}
